/**
 * Ingestor Service Configuration using BaseService template
 */

import { BaseService, ServiceConfig } from "@realestate/shared-utils";
import { Pool } from "pg";
import { LogBus } from "./adapters/bus.log";
import { MemoryListingRepo } from "./adapters/repo.memory";
import { SqlListingRepo } from "./adapters/repo.sql";
import { DDFSource } from "./adapters/source.ddf";
import { MockSource } from "./adapters/source.mock";
import { SeleniumSource } from "./adapters/source.selenium";
import { appCfg, dbCfg, sourceCfg } from "./config/env";
import { PollingPoller } from "./core/poller";

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
  bus: any;
  cache?: any;
  db?: Pool;
  repositories: {
    listings: MemoryListingRepo | SqlListingRepo;
  };
  clients: {
    source: MockSource | DDFSource | SeleniumSource;
  };
  logger: any;
}

/**
 * Business logic implementation
 */
export class IngestorBusinessLogic {
  private poller?: PollingPoller;
  private isPolling = false;
  private metrics = {
    pollsCompleted: 0,
    listingsProcessed: 0,
    listingsChanged: 0,
    eventsPublished: 0,
    errors: 0,
  };

  constructor(private deps: IngestorDependencies) {}

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
        onProgress: (processed, total) => {
          this.deps.logger.info(`Processing batch: ${processed}/${total}`);
        },
        onListingChanged: async (listing, change) => {
          // Publish listing_changed event
          await this.deps.bus.publish("listing_changed", {
            id: listing.id,
            updatedAt: listing.updatedAt,
            change,
            dirty: this.detectDirtyFields(listing, change),
          });

          this.metrics.eventsPublished++;
          this.deps.logger.info(`Published listing_changed for ${listing.id}:`, {
            change,
            dirty: this.detectDirtyFields(listing, change),
          });
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
    listing: any,
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
    return new Promise(resolve => setTimeout(resolve, ms));
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

  createBusinessLogic: (deps) => {
    const logic = new IngestorBusinessLogic(deps);
    
    // Start polling when business logic is created
    setImmediate(() => {
      logic.startPolling().catch(error => {
        deps.logger.error("Failed to start polling:", error);
      });
    });
    
    return logic;
  },

  createRepositories: (pool) => ({
    listings: appCfg.mode === "dev" 
      ? new MemoryListingRepo()
      : new SqlListingRepo(pool),
  }),

  createExternalClients: () => {
    // Create source based on configuration
    let source: MockSource | DDFSource | SeleniumSource;
    
    switch (sourceCfg.type) {
      case "mock":
        source = new MockSource(sourceCfg.mockFixturesPath);
        break;
      case "ddf":
        source = new DDFSource(sourceCfg.ddfConfig);
        break;
      case "selenium":
        source = new SeleniumSource(sourceCfg.seleniumConfig);
        break;
      default:
        source = new MockSource("fixtures/treb_listings.json");
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
        (this.businessLogic as IngestorBusinessLogic).stopPolling();
      }
    });

    await super.start();
  }
}
