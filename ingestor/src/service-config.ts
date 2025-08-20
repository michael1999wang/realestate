/**
 * Ingestor Service Configuration using BaseService template
 */

import {
  BaseService,
  BusinessLogic,
  BusinessLogicBase,
  BusPort,
  ListingChangedEvent,
  Logger,
  ServiceConfig,
} from "@realestate/shared-utils";
import { Pool } from "pg";
import { LogBus } from "./adapters/bus.log";
import { MemoryRepo } from "./adapters/repo.memory";
import { SqlRepo } from "./adapters/repo.sql";
import { DDFSource } from "./adapters/source.ddf";
import { MockSource } from "./adapters/source.mock";
import { SeleniumSource } from "./adapters/source.selenium";
import { appCfg, sourceCfg } from "./config/env";
import { PollingPoller } from "./core/poller-class";

/**
 * Event map for type safety - Ingestor only publishes, doesn't subscribe
 */
export interface IngestorEventMap {
  // No subscriptions - this service only publishes
}

/**
 * Service dependencies
 */
export interface IngestorDependencies {
  bus: BusPort;
  cache?: unknown;
  db?: Pool;
  repositories: {
    listings: MemoryRepo | SqlRepo;
  };
  clients: {
    source: MockSource | DDFSource | SeleniumSource;
  };
  logger: Logger;
}

/**
 * Business logic implementation
 */
export class IngestorBusinessLogic extends BusinessLogicBase<
  IngestorDependencies,
  IngestorEventMap
> {
  private poller?: PollingPoller;
  private isPolling = false;
  private metrics = {
    pollsCompleted: 0,
    listingsProcessed: 0,
    listingsChanged: 0,
    eventsPublished: 0,
    errors: 0,
  };

  constructor(deps: IngestorDependencies) {
    super(deps);
  }

  /**
   * Start polling for listings
   */
  async startPolling(): Promise<void> {
    if (this.isPolling) {
      this.deps.logger.warn("Polling already started");
      return;
    }

    this.deps.logger.info("Starting listing ingestion polling...");

    this.poller = new PollingPoller(
      this.deps.clients.source,
      this.deps.repositories.listings,
      new LogBus("ingestor"), // TODO: Use the actual bus from dependencies
      {
        intervalMs: appCfg.pollIntervalSec * 1000,
        batchSize: appCfg.batchSize,
        retryAttempts: 3,
        retryDelayMs: 1000,
        onProgress: (processed: number, total: number) => {
          this.deps.logger.info(`Processing batch: ${processed}/${total}`);
        },
        onListingChanged: async (
          listing: unknown,
          change: "create" | "update" | "status_change"
        ) => {
          // Publish listing_changed event
          const listingWithId = listing as { id: string; updatedAt: string };
          await this.deps.bus.publish<ListingChangedEvent>({
            type: "listing_changed",
            id: listingWithId.id,
            timestamp: new Date().toISOString(),
            data: {
              id: listingWithId.id,
              updatedAt: listingWithId.updatedAt,
              change,
              dirty: this.detectDirtyFields(listing, change),
            },
          });

          this.metrics.eventsPublished++;
          this.deps.logger.info(
            `Published listing_changed for ${listingWithId.id}:`,
            {
              change,
              dirty: this.detectDirtyFields(listing, change),
            }
          );
        },
      }
    );

    // Start polling
    this.isPolling = true;
    this.startPollingLoop();

    this.deps.logger.info("Listing ingestion polling started");
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (!this.isPolling) {
      return;
    }

    this.deps.logger.info("Stopping listing ingestion polling...");
    this.isPolling = false;

    if (this.poller) {
      this.poller.stop();
    }

    this.deps.logger.info("Listing ingestion polling stopped");
  }

  /**
   * Detect which fields have changed (simplified logic)
   */
  private detectDirtyFields(
    listing: unknown,
    change: "create" | "update" | "status_change"
  ): ("price" | "status" | "fees" | "tax" | "media" | "address")[] {
    // For now, return common dirty fields based on change type
    // In a real implementation, you'd compare with the previous version
    switch (change) {
      case "create":
        return ["price", "status", "fees", "tax", "media", "address"];
      case "update":
        return ["price", "fees", "tax", "media"];
      case "status_change":
        return ["status"];
      default:
        return [];
    }
  }

  /**
   * Main polling loop
   */
  private async startPollingLoop(): Promise<void> {
    while (this.isPolling) {
      try {
        this.deps.logger.info("Starting poll cycle...");

        const result = await this.poller!.poll();

        this.metrics.pollsCompleted++;
        this.metrics.listingsProcessed += result.processed;
        this.metrics.listingsChanged += result.changed;

        this.deps.logger.info("Poll cycle completed:", {
          processed: result.processed,
          changed: result.changed,
          errors: result.errors,
          durationMs: result.durationMs,
        });

        // Wait for next poll interval
        if (this.isPolling) {
          await this.sleep(appCfg.pollIntervalSec * 1000);
        }
      } catch (error) {
        this.metrics.errors++;
        this.deps.logger.error("Error in polling loop:", error);

        // Wait before retrying
        if (this.isPolling) {
          await this.sleep(5000); // 5 seconds
        }
      }
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    return this.metrics.errors === 0 || this.metrics.pollsCompleted > 0;
  }
}

/**
 * Service configuration
 */
export const ingestorServiceConfig: ServiceConfig<
  IngestorDependencies,
  IngestorEventMap
> = {
  name: "ingestor",
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
    type: "memory",
  },

  subscriptions: [], // Ingestor only publishes, doesn't subscribe

  publications: [{ topic: "listing_changed" }],

  createBusinessLogic: (deps: IngestorDependencies) => {
    const logic = new IngestorBusinessLogic(deps);

    // Start polling when business logic is created
    setImmediate(() => {
      logic.startPolling().catch((error: unknown) => {
        deps.logger.error("Failed to start polling:", error);
      });
    });

    return logic as unknown as BusinessLogic<IngestorEventMap>;
  },

  createRepositories: (pool: Pool) => ({
    listings:
      appCfg.mode === "dev"
        ? new MemoryRepo()
        : new SqlRepo({
            host: process.env.DB_HOST || "localhost",
            port: parseInt(process.env.DB_PORT || "5432", 10),
            user: process.env.DB_USER || "postgres",
            password: process.env.DB_PASSWORD || "password",
            database: process.env.DB_NAME || "ingestor_dev",
          }),
  }),

  createExternalClients: () => {
    // Create source based on configuration
    let source: MockSource | DDFSource | SeleniumSource;

    switch (sourceCfg.type) {
      case "mock":
        source = new MockSource(25); // page size
        break;
      case "ddf":
        source = new DDFSource({
          baseUrl: process.env.DDF_BASE_URL || "https://api.ddf.ca",
          username: process.env.DDF_USERNAME || "",
          password: process.env.DDF_PASSWORD || "",
          loginUrl: process.env.DDF_LOGIN_URL || "https://api.ddf.ca/login",
        });
        break;
      case "selenium":
        source = new SeleniumSource({
          baseUrl: process.env.SELENIUM_BASE_URL || "https://example.com",
        });
        break;
      default:
        source = new MockSource(25);
    }

    return { source };
  },

  healthCheck: {
    intervalMs: 30000,
    customChecks: [
      {
        name: "source_connectivity",
        check: async () => {
          // Could implement actual source health check here
          return true;
        },
      },
    ],
  },

  shutdownTimeoutMs: 20000, // 20 seconds to finish current poll
};

/**
 * Ingestor Service using BaseService template
 */
export class IngestorService extends BaseService<
  IngestorDependencies,
  IngestorEventMap
> {
  constructor() {
    super(ingestorServiceConfig);
  }

  /**
   * Override to handle polling shutdown
   */
  async start(): Promise<void> {
    // Add custom shutdown handler to stop polling
    this.lifecycle.addShutdownHandler(async () => {
      if (this.businessLogic) {
        (this.businessLogic as unknown as IngestorBusinessLogic).stopPolling();
      }
    });

    await super.start();
  }
}
