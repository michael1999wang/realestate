/**
 * Enrichment Service Configuration using BaseService template
 */

import {
  BaseService,
  BusinessLogic,
  BusinessLogicBase,
  BusPort,
  Logger,
  MemoryCache,
  ServiceConfig,
  UnderwriteRequestedEvent,
} from "@realestate/shared-utils";
import { Pool } from "pg";
import { RedisCache } from "./adapters/cache.redis";
import { CMHCAPI } from "./adapters/cmhc.api";
import { GeocoderAPI } from "./adapters/geocode.api";
import { MemoryListingRepo } from "./adapters/repo.memory";
import { SQLEnrichmentRepo } from "./adapters/repo.sql";
import { TaxesTable } from "./adapters/taxes.table";
import { WalkScoreAPI } from "./adapters/walkscore.api";
import { appCfg } from "./config/env";
import { enrichOne } from "./core/enrich";

/**
 * Event map for type safety
 */
export interface EnrichmentEventMap {
  listing_changed: {
    id: string;
    updatedAt: string;
    change: "create" | "update" | "status_change";
    dirty?: ("price" | "status" | "fees" | "tax" | "media" | "address")[];
  };
}

/**
 * Service dependencies
 */
export interface EnrichmentDependencies {
  bus: BusPort;
  cache: RedisCache | MemoryCache;
  db?: Pool;
  repositories: {
    enrichment: SQLEnrichmentRepo;
    listing: MemoryListingRepo; // TODO: Replace with actual listing repo
  };
  clients: {
    walkScore: WalkScoreAPI;
    cmhc: CMHCAPI;
    geocoder: GeocoderAPI;
    taxes: TaxesTable;
  };
  logger: Logger;
}

/**
 * Business logic implementation
 */
export class EnrichmentBusinessLogic extends BusinessLogicBase<
  EnrichmentDependencies,
  EnrichmentEventMap
> {
  private processedListings = new Set<string>();
  private metrics = {
    eventsProcessed: 0,
    enrichmentsChanged: 0,
    enrichmentsUnchanged: 0,
    underwriteRequestsPublished: 0,
    errors: 0,
  };

  constructor(deps: EnrichmentDependencies) {
    super(deps);
  }

  /**
   * Handle listing changed events
   */
  async handleListingChanged(
    event: EnrichmentEventMap["listing_changed"]
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.deps.logger.info(`Processing listing_changed for ${event.id}`);

      // Check if we should process based on debouncing
      const cacheKey = `enrichment:debounce:${event.id}`;
      const lastProcessed = await this.deps.cache.get(cacheKey);

      const isDirtyAddress = event.dirty?.includes("address") ?? false;
      const isDirtyFinancial =
        event.dirty?.some((field) =>
          ["price", "fees", "tax"].includes(field)
        ) ?? false;

      // Skip if recently processed unless critical fields changed
      if (lastProcessed && !isDirtyAddress && !isDirtyFinancial) {
        const timeSince = Date.now() - parseInt(lastProcessed);
        if (timeSince < appCfg.debounceTimeoutSec * 1000) {
          this.deps.logger.info(`Skipping ${event.id} due to debouncing`);
          return;
        }
      }

      // Set debounce cache
      await this.deps.cache.set(cacheKey, Date.now().toString(), 60);

      // Get listing details
      const listing = await this.deps.repositories.listing.getListingById(
        event.id
      );
      if (!listing) {
        this.deps.logger.warn(
          `Listing ${event.id} not found, skipping enrichment`
        );
        return;
      }

      // Perform enrichment
      const result = await enrichOne(event.id, {
        listingRepo: this.deps.repositories.listing,
        enrRepo: this.deps.repositories.enrichment,
        cache: this.deps.cache,
        walk: this.deps.clients.walkScore,
        cmhc: this.deps.clients.cmhc,
        taxes: this.deps.clients.taxes,
        geo: this.deps.clients.geocoder,
      });

      this.metrics.eventsProcessed++;

      if (result.changed) {
        this.metrics.enrichmentsChanged++;

        // Publish underwrite request if financial inputs changed significantly
        if (isDirtyFinancial) {
          await this.deps.bus.publish<UnderwriteRequestedEvent>({
            type: "underwrite_requested",
            id: event.id,
            timestamp: new Date().toISOString(),
            data: {
              id: event.id,
            },
          });

          this.metrics.underwriteRequestsPublished++;
          this.deps.logger.info(
            `Published underwrite_requested for ${event.id}`
          );
        }
      } else {
        this.metrics.enrichmentsUnchanged++;
      }

      const duration = Date.now() - startTime;
      this.deps.logger.info(`Enriched listing ${event.id}:`, {
        changed: result.changed,
        durationMs: duration,
      });
    } catch (error) {
      this.metrics.errors++;
      const duration = Date.now() - startTime;

      this.deps.logger.error(`Error enriching listing ${event.id}:`, {
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration,
      });

      throw error; // Re-throw for retry logic
    }
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.metrics.errors === 0 || this.metrics.eventsProcessed > 0;
  }
}

/**
 * Service configuration
 */
export const enrichmentServiceConfig: ServiceConfig<
  EnrichmentDependencies,
  EnrichmentEventMap
> = {
  name: "enrichment",
  version: "1.0.0",

  database: {
    schema: "sql/init.sql",
    pool: {
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  },

  cache: {
    type: appCfg.mode === "development" ? "memory" : "redis",
  },

  subscriptions: [
    {
      topic: "listing_changed",
      handler: "handleListingChanged",
      consumerGroup: "enrichment",
      options: {
        retries: 3,
        debounce: parseInt(process.env.DEBOUNCE_TIMEOUT_SEC || "30") * 1000,
      },
    },
  ],

  publications: [{ topic: "underwrite_requested" }],

  createBusinessLogic: (deps: EnrichmentDependencies) =>
    new EnrichmentBusinessLogic(
      deps
    ) as unknown as BusinessLogic<EnrichmentEventMap>,

  createRepositories: (pool: Pool) => ({
    enrichment: new SQLEnrichmentRepo(pool),
    // TODO: Replace with actual listing repository
    listing: (() => {
      const repo = new MemoryListingRepo();
      // Seed with test data for development
      const mockListings = [
        {
          id: "listing-toronto-1",
          updatedAt: "2024-01-01T00:00:00Z",
          address: {
            street: "123 King St W",
            city: "Toronto",
            province: "ON",
            postalCode: "M5V 3A1",
            lat: 43.6532,
            lng: -79.3832,
          },
          listPrice: 850000,
          taxesAnnual: 5400,
          condoFeeMonthly: 420,
          propertyType: "Condo",
        },
        {
          id: "listing-toronto-2",
          updatedAt: "2024-01-01T00:00:00Z",
          address: {
            street: "456 Queen St E",
            city: "Toronto",
            province: "ON",
            postalCode: "M5A 1S2",
          },
          listPrice: 650000,
          propertyType: "Apartment",
        },
      ];
      for (const listing of mockListings) {
        repo.setListing(listing);
      }
      return repo;
    })(),
  }),

  createExternalClients: () => ({
    walkScore: new WalkScoreAPI(
      process.env.WALKSCORE_API_KEY,
      !process.env.WALKSCORE_API_KEY
    ),
    cmhc: new CMHCAPI((process.env.CMHC_MODE || "mock") === "mock"),
    geocoder: new GeocoderAPI(
      (process.env.GEOCODE_PROVIDER || "mock") as any,
      process.env.GEOCODE_API_KEY
    ),
    taxes: new TaxesTable(),
  }),

  healthCheck: {
    intervalMs: 30000,
    customChecks: [
      {
        name: "external_apis",
        check: async () => {
          // Could implement actual API health checks here
          return true;
        },
      },
    ],
  },

  shutdownTimeoutMs: 20000,
};

/**
 * Enrichment Service using BaseService template
 */
export class EnrichmentService extends BaseService<
  EnrichmentDependencies,
  EnrichmentEventMap
> {
  constructor() {
    super(enrichmentServiceConfig);
  }
}
