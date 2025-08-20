/**
 * Rent Estimator Service Configuration using BaseService template
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
import { MockCompsSource } from "./adapters/comps.source";
import { MockPriorsSource } from "./adapters/priors.source";
import { MockReadAdapter } from "./adapters/read.mock";
import { MemoryRentRepo } from "./adapters/repo.memory";
import { SqlRentRepo } from "./adapters/repo.sql";
import { estimateForListing } from "./core/estimate";

/**
 * Event map for type safety
 */
export interface RentEstimatorEventMap {
  listing_changed: {
    id: string;
    updatedAt: string;
    change: "create" | "update" | "status_change";
    dirty?: ("price" | "status" | "fees" | "tax" | "media" | "address")[];
  };
  data_enriched: {
    id: string;
    enrichmentTypes: string[];
    updatedAt: string;
  };
}

/**
 * Service dependencies
 */
export interface RentEstimatorDependencies {
  bus: BusPort;
  cache: RedisCache | MemoryCache;
  db?: Pool;
  repositories: {
    rent: MemoryRentRepo | SqlRentRepo;
  };
  clients: {
    read: MockReadAdapter;
    priors: MockPriorsSource;
    comps: MockCompsSource;
  };
  logger: Logger;
}

/**
 * Business logic implementation
 */
export class RentEstimatorBusinessLogic extends BusinessLogicBase<
  RentEstimatorDependencies,
  RentEstimatorEventMap
> {
  private processedListings = new Set<string>();
  private metrics = {
    eventsProcessed: 0,
    estimatesChanged: 0,
    estimatesUnchanged: 0,
    underwriteRequestsPublished: 0,
    errors: 0,
  };

  constructor(deps: RentEstimatorDependencies) {
    super(deps);
  }

  /**
   * Handle listing changed events
   */
  async handleListingChanged(
    event: RentEstimatorEventMap["listing_changed"]
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.deps.logger.info(`Processing listing_changed for ${event.id}`);

      // Check if address is dirty (force immediate processing)
      const isDirtyAddress = event.dirty?.includes("address") ?? false;

      // Apply debouncing unless address is dirty
      if (!isDirtyAddress) {
        const cacheKey = `rent-estimator:debounce:${event.id}`;
        const lastProcessed = await this.deps.cache.get(cacheKey);

        if (lastProcessed) {
          const timeSince = Date.now() - parseInt(lastProcessed);
          if (timeSince < 30000) {
            // 30 seconds
            this.deps.logger.info(`Skipping ${event.id} due to debouncing`);
            return;
          }
        }

        await this.deps.cache.set(cacheKey, Date.now().toString(), 60);
      }

      // Process the listing
      const result = await estimateForListing(event.id, {
        read: this.deps.clients.read,
        rentRepo: this.deps.repositories.rent,
        priors: this.deps.clients.priors,
        comps: this.deps.clients.comps,
        cache: this.deps.cache,
        bus: {
          subscribe: this.deps.bus.subscribe.bind(this.deps.bus),
          publish: async (evt: { id: string }) => {
            await this.deps.bus.publish<UnderwriteRequestedEvent>({
              type: "underwrite_requested",
              id: evt.id,
              timestamp: new Date().toISOString(),
              data: evt,
            });
          },
        },
      });

      this.metrics.eventsProcessed++;

      if (result.changed) {
        this.metrics.estimatesChanged++;

        // Publish underwrite request when rent estimate changes materially
        await this.deps.bus.publish<UnderwriteRequestedEvent>({
          type: "underwrite_requested",
          id: event.id,
          timestamp: new Date().toISOString(),
          data: {
            id: event.id,
          },
        });

        this.metrics.underwriteRequestsPublished++;
        this.deps.logger.info(`Published underwrite_requested for ${event.id}`);
      } else {
        this.metrics.estimatesUnchanged++;
      }

      const duration = Date.now() - startTime;
      this.deps.logger.info(`Processed listing ${event.id}:`, {
        listingId: event.id,
        method: result.estimate?.method,
        comps_n: result.estimate?.featuresUsed.comps?.length ?? 0,
        p50: result.estimate?.p50,
        changed: result.changed,
        durationMs: duration,
      });
    } catch (error) {
      this.metrics.errors++;
      const duration = Date.now() - startTime;

      this.deps.logger.error(
        `Error processing listing_changed for ${event.id}:`,
        {
          error: error instanceof Error ? error.message : String(error),
          durationMs: duration,
        }
      );

      throw error; // Re-throw for retry logic
    }
  }

  /**
   * Handle data enriched events
   */
  async handleDataEnriched(
    event: RentEstimatorEventMap["data_enriched"]
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.deps.logger.info(`Processing data_enriched for ${event.id}`);

      // Always process data enriched events (no debouncing)
      const result = await estimateForListing(event.id, {
        read: this.deps.clients.read,
        rentRepo: this.deps.repositories.rent,
        priors: this.deps.clients.priors,
        comps: this.deps.clients.comps,
        cache: this.deps.cache,
        bus: {
          subscribe: this.deps.bus.subscribe.bind(this.deps.bus),
          publish: async (evt: { id: string }) => {
            await this.deps.bus.publish<UnderwriteRequestedEvent>({
              type: "underwrite_requested",
              id: evt.id,
              timestamp: new Date().toISOString(),
              data: evt,
            });
          },
        },
      });

      this.metrics.eventsProcessed++;

      if (result.changed) {
        this.metrics.estimatesChanged++;

        await this.deps.bus.publish<UnderwriteRequestedEvent>({
          type: "underwrite_requested",
          id: event.id,
          timestamp: new Date().toISOString(),
          data: {
            id: event.id,
          },
        });

        this.metrics.underwriteRequestsPublished++;
      } else {
        this.metrics.estimatesUnchanged++;
      }

      const duration = Date.now() - startTime;
      this.deps.logger.info(`Processed enriched data for ${event.id}:`, {
        listingId: event.id,
        method: result.estimate?.method,
        comps_n: result.estimate?.featuresUsed.comps?.length ?? 0,
        p50: result.estimate?.p50,
        changed: result.changed,
        durationMs: duration,
      });
    } catch (error) {
      this.metrics.errors++;
      const duration = Date.now() - startTime;

      this.deps.logger.error(
        `Error processing data_enriched for ${event.id}:`,
        {
          error: error instanceof Error ? error.message : String(error),
          durationMs: duration,
        }
      );

      throw error;
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
export const rentEstimatorServiceConfig: ServiceConfig<
  RentEstimatorDependencies,
  RentEstimatorEventMap
> = {
  name: "rent-estimator",
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
    type: process.env.NODE_ENV === "test" ? "memory" : "redis",
  },

  subscriptions: [
    {
      topic: "listing_changed",
      handler: "handleListingChanged",
      consumerGroup: "rent",
      options: {
        retries: 3,
        debounce: 30000, // 30 seconds
      },
    },
    {
      topic: "data_enriched",
      handler: "handleDataEnriched",
      consumerGroup: "rent_enriched",
      options: {
        retries: 3,
      },
    },
  ],

  publications: [{ topic: "underwrite_requested" }],

  createBusinessLogic: (deps: RentEstimatorDependencies) =>
    new RentEstimatorBusinessLogic(
      deps
    ) as unknown as BusinessLogic<RentEstimatorEventMap>,

  createRepositories: (pool: Pool) => ({
    rent:
      process.env.USE_MEMORY === "true" || process.env.NODE_ENV === "test"
        ? new MemoryRentRepo()
        : new SqlRentRepo({
            host: process.env.DB_HOST || "localhost",
            port: parseInt(process.env.DB_PORT || "5435", 10),
            user: process.env.DB_USER || "postgres",
            password: process.env.DB_PASSWORD || "password",
            database: process.env.DB_NAME || "rent_estimator_dev",
          }),
  }),

  createExternalClients: () => ({
    read: new MockReadAdapter(),
    priors: new MockPriorsSource(),
    comps: new MockCompsSource(),
  }),

  healthCheck: {
    intervalMs: 30000,
    customChecks: [
      {
        name: "database_connectivity",
        check: async () => {
          // Could implement actual DB health check here
          return true;
        },
      },
    ],
  },

  shutdownTimeoutMs: 15000,
};

/**
 * Rent Estimator Service using BaseService template
 */
export class RentEstimatorService extends BaseService<
  RentEstimatorDependencies,
  RentEstimatorEventMap
> {
  constructor() {
    super(rentEstimatorServiceConfig);
  }
}
