/**
 * Underwriting Service Configuration using BaseService template
 */

import { BaseService, ServiceConfig } from "@realestate/shared-utils";
import { Pool } from "pg";
import { SnapshotsReadAdapter } from "./adapters/read.snapshots";
import {
  SqlAssumptionsRepo,
  SqlFactorsRepo,
  SqlUWRepo,
} from "./adapters/repo.sql";
import { dbCfg, gridCfg } from "./config/env";
import { computeExactFromId } from "./core/exact";
import { computeGrid } from "./core/grid";

/**
 * Event map for type safety
 */
export interface UnderwritingEventMap {
  underwrite_requested: {
    id: string;
    assumptionsId?: string;
  };
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
export interface UnderwritingDependencies {
  bus: any;
  cache?: any;
  db?: Pool;
  repositories: {
    snapshots: SnapshotsReadAdapter;
    assumptions: SqlAssumptionsRepo;
    underwriting: SqlUWRepo;
    factors: SqlFactorsRepo;
  };
  clients: Record<string, any>;
  logger: any;
}

/**
 * Business logic implementation
 */
export class UnderwritingBusinessLogic {
  private metrics = {
    underwriteRequestsProcessed: 0,
    listingChangesProcessed: 0,
    gridComputations: 0,
    exactComputations: 0,
    completedEventsPublished: 0,
    errors: 0,
  };

  constructor(private deps: UnderwritingDependencies) {}

  /**
   * Handle underwrite_requested event
   * Computes either grid (default) or exact (with assumptionsId)
   */
  async handleUnderwriteRequested(
    event: UnderwritingEventMap["underwrite_requested"]
  ): Promise<void> {
    try {
      this.deps.logger.info(`Processing underwrite request for listing ${event.id}`);

      // Load base inputs to ensure listing exists
      const baseInputs = await this.deps.repositories.snapshots.loadBaseInputs(event.id);
      if (!baseInputs) {
        this.deps.logger.warn(`Base inputs not found for listing ${event.id}, skipping`);
        return;
      }

      let resultId: string;
      let source: "grid" | "exact";

      if (event.assumptionsId) {
        // Exact computation with specific assumptions
        this.deps.logger.info(
          `Computing exact underwrite for ${event.id} with assumptions ${event.assumptionsId}`
        );

        const result = await computeExactFromId(
          event.id,
          event.assumptionsId,
          this.deps.repositories.snapshots,
          this.deps.repositories.assumptions,
          this.deps.repositories.underwriting,
          this.deps.repositories.factors
        );

        resultId = result.resultId;
        source = "exact";
        this.metrics.exactComputations++;

      } else {
        // Grid computation with default assumptions
        this.deps.logger.info(`Computing grid underwrite for ${event.id}`);

        const result = await computeGrid(
          event.id,
          this.deps.repositories.snapshots,
          this.deps.repositories.underwriting,
          this.deps.repositories.factors,
          gridCfg
        );

        resultId = result.resultId;
        source = "grid";
        this.metrics.gridComputations++;
      }

      // Publish completion event
      await this.deps.bus.publish("underwrite_completed", {
        id: event.id,
        resultId,
        source,
        score: undefined, // Could add scoring logic here
      });

      this.metrics.underwriteRequestsProcessed++;
      this.metrics.completedEventsPublished++;

      this.deps.logger.info(`Completed underwrite for ${event.id}:`, {
        resultId,
        source,
        assumptionsId: event.assumptionsId,
      });

    } catch (error) {
      this.metrics.errors++;
      this.deps.logger.error(`Error processing underwrite request for ${event.id}:`, error);
      throw error; // Re-throw for retry logic
    }
  }

  /**
   * Handle listing_changed event
   * Recomputes grid if financial inputs changed
   */
  async handleListingChanged(
    event: UnderwritingEventMap["listing_changed"]
  ): Promise<void> {
    try {
      this.deps.logger.info(`Processing listing_changed for ${event.id}`);

      // Only process if financial inputs changed
      const financialFields = ["price", "fees", "tax"];
      const hasFinancialChanges = event.dirty?.some(field => 
        financialFields.includes(field)
      ) ?? false;

      if (!hasFinancialChanges) {
        this.deps.logger.info(`No financial changes for ${event.id}, skipping recompute`);
        return;
      }

      // Load base inputs
      const baseInputs = await this.deps.repositories.snapshots.loadBaseInputs(event.id);
      if (!baseInputs) {
        this.deps.logger.warn(`Base inputs not found for listing ${event.id}, skipping`);
        return;
      }

      // Recompute grid (invalidates cached results)
      this.deps.logger.info(`Recomputing grid for ${event.id} due to financial changes`);
      
      const result = await computeGrid(
        event.id,
        this.deps.repositories.snapshots,
        this.deps.repositories.underwriting,
        this.deps.repositories.factors,
        gridCfg
      );

      // Publish completion event
      await this.deps.bus.publish("underwrite_completed", {
        id: event.id,
        resultId: result.resultId,
        source: "grid",
        score: undefined,
      });

      this.metrics.listingChangesProcessed++;
      this.metrics.gridComputations++;
      this.metrics.completedEventsPublished++;

      this.deps.logger.info(`Recomputed underwrite for ${event.id}:`, {
        resultId: result.resultId,
        source: "grid",
        trigger: "listing_changed",
      });

    } catch (error) {
      this.metrics.errors++;
      this.deps.logger.error(`Error processing listing_changed for ${event.id}:`, error);
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
    return this.metrics.errors === 0 || (
      this.metrics.underwriteRequestsProcessed > 0 || 
      this.metrics.listingChangesProcessed > 0
    );
  }
}

/**
 * Service configuration
 */
export const underwritingServiceConfig: ServiceConfig<
  UnderwritingDependencies,
  UnderwritingEventMap
> = {
  name: "underwriting",
  version: "1.0.0",

  database: {
    schema: "sql/init.sql",
    pool: {
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
  },

  cache: {
    type: "memory", // Could be 'redis' in prod
  },

  subscriptions: [
    {
      topic: "underwrite_requested",
      handler: "handleUnderwriteRequested",
      consumerGroup: "underwriting",
      options: {
        retries: 3,
      },
    },
    {
      topic: "listing_changed",
      handler: "handleListingChanged",
      consumerGroup: "underwriting_listings",
      options: {
        retries: 3,
        debounce: 5000, // 5 seconds
      },
    },
  ],

  publications: [{ topic: "underwrite_completed" }],

  createBusinessLogic: (deps) => new UnderwritingBusinessLogic(deps),

  createRepositories: (pool) => ({
    snapshots: new SnapshotsReadAdapter(pool),
    assumptions: new SqlAssumptionsRepo(pool),
    underwriting: new SqlUWRepo(pool),
    factors: new SqlFactorsRepo(pool),
  }),

  createExternalClients: () => ({}), // No external clients needed

  healthCheck: {
    intervalMs: 60000, // 1 minute
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

  shutdownTimeoutMs: 30000, // 30 seconds
};

/**
 * Underwriting Service using BaseService template
 */
export class UnderwritingService extends BaseService<
  UnderwritingDependencies,
  UnderwritingEventMap
> {
  constructor() {
    super(underwritingServiceConfig);
  }
}
