/**
 * Alerts Service Configuration using BaseService template
 */

import { BaseService, ServiceConfig } from "@realestate/shared-utils";
import { Pool } from "pg";
import { sendDevBrowser } from "./adapters/delivery.devbrowser";
import { MockReadAdapter } from "./adapters/read.mock";
import { MemoryAlertsRepo } from "./adapters/repo.memory";
import { PostgresAlertsRepo } from "./adapters/repo.sql";
import { cfg } from "./config/env";
import { MultiChannelDispatcher } from "./core/dispatch";

/**
 * Event map for type safety
 */
export interface AlertsEventMap {
  underwrite_completed: {
    id: string;
    resultId: string;
    source: "grid" | "exact";
    score?: number;
  };
  property_scored: {
    id: string;
    score: number;
    userId?: string;
  };
}

/**
 * Service dependencies
 */
export interface AlertsDependencies {
  bus: any;
  cache?: any;
  db?: Pool;
  repositories: {
    alerts: MemoryAlertsRepo | PostgresAlertsRepo;
  };
  clients: {
    read: MockReadAdapter;
    dispatcher: MultiChannelDispatcher;
  };
  logger: any;
}

/**
 * Business logic implementation
 */
export class AlertsBusinessLogic {
  constructor(private deps: AlertsDependencies) {}

  /**
   * Handle underwrite completed events
   */
  async handleUnderwriteCompleted(
    event: AlertsEventMap["underwrite_completed"]
  ): Promise<void> {
    this.deps.logger.info(
      `Processing underwrite_completed for listing ${event.id}`
    );

    // Get all active saved searches
    const savedSearches =
      await this.deps.repositories.alerts.getActiveSavedSearches();

    for (const search of savedSearches) {
      // Get listing details
      const listing = await this.deps.clients.read.getListing(event.id);
      if (!listing) {
        this.deps.logger.warn(
          `Listing ${event.id} not found, skipping alert check`
        );
        continue;
      }

      // Get underwriting results
      const result = await this.deps.clients.read.getUnderwriteResult(
        event.resultId
      );
      if (!result) {
        this.deps.logger.warn(
          `Result ${event.resultId} not found, skipping alert check`
        );
        continue;
      }

      // Check if listing matches search criteria
      if (
        this.matchesSearchCriteria(listing, search) &&
        this.meetsThresholds(result.metrics, search.thresholds)
      ) {
        // Create alert
        const alert = {
          id: this.generateAlertId(),
          userId: search.userId,
          listingId: event.id,
          resultId: event.resultId,
          savedSearchId: search.id,
          createdAt: new Date().toISOString(),
        };

        await this.deps.repositories.alerts.createAlert(alert);

        // Dispatch notifications
        await this.deps.clients.dispatcher.dispatch({
          type: "alert_created",
          data: alert,
          channels: search.notify.channel,
        });

        this.deps.logger.info(
          `Alert created for user ${search.userId}, listing ${event.id}`
        );

        // Publish alert fired event
        await this.deps.bus.publish("alerts_fired", {
          userId: search.userId,
          listingId: event.id,
          resultId: event.resultId,
        });
      }
    }
  }

  /**
   * Handle property scored events
   */
  async handlePropertyScored(
    event: AlertsEventMap["property_scored"]
  ): Promise<void> {
    this.deps.logger.info(
      `Processing property_scored for listing ${event.id}, score: ${event.score}`
    );

    // Similar logic to underwrite_completed but for scored properties
    // This is a simplified implementation
    this.deps.logger.info(`Property ${event.id} scored: ${event.score}`);
  }

  /**
   * Check if listing matches search criteria
   */
  private matchesSearchCriteria(listing: any, search: any): boolean {
    // Implement filtering logic
    if (search.filter.city && listing.city !== search.filter.city) return false;
    if (search.filter.province && listing.province !== search.filter.province)
      return false;
    if (
      search.filter.propertyType &&
      listing.propertyType !== search.filter.propertyType
    )
      return false;
    if (search.filter.maxPrice && listing.price > search.filter.maxPrice)
      return false;

    return true;
  }

  /**
   * Check if results meet threshold requirements
   */
  private meetsThresholds(metrics: any, thresholds: any): boolean {
    if (thresholds.minDSCR && metrics.dscr < thresholds.minDSCR) return false;
    if (thresholds.minCoC && metrics.cashOnCashPct < thresholds.minCoC)
      return false;
    if (thresholds.requireNonNegativeCF && metrics.cashFlowAnnual < 0)
      return false;

    return true;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Service configuration
 */
export const alertsServiceConfig: ServiceConfig<
  AlertsDependencies,
  AlertsEventMap
> = {
  name: "alerts",
  version: "1.0.0",

  database:
    cfg.mode === "prod"
      ? {
          schema: "sql/init.sql",
          pool: {
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
          },
        }
      : undefined,

  cache: {
    type: "memory", // Could be 'redis' in prod
  },

  subscriptions: [
    {
      topic: "underwrite_completed",
      handler: "handleUnderwriteCompleted",
      consumerGroup: "alerts",
      options: {
        retries: 3,
        debounce: 1000, // 1 second
      },
    },
    {
      topic: "property_scored",
      handler: "handlePropertyScored",
      consumerGroup: "alerts_scoring",
    },
  ],

  publications: [{ topic: "alerts_fired" }],

  createBusinessLogic: (deps) => new AlertsBusinessLogic(deps),

  createRepositories: (pool) => ({
    alerts:
      cfg.mode === "dev"
        ? new MemoryAlertsRepo([
            // Sample saved search for development
            {
              id: "search-1",
              userId: "user-123",
              name: "Toronto Condos",
              filter: {
                city: "Toronto",
                province: "ON",
                propertyType: "Condo",
                maxPrice: 800000,
              },
              thresholds: {
                minDSCR: 1.2,
                minCoC: 0.08,
                requireNonNegativeCF: true,
              },
              notify: {
                channel: ["devbrowser", "email"],
              },
              isActive: true,
              createdAt: new Date().toISOString(),
            },
          ])
        : new PostgresAlertsRepo(pool),
  }),

  createExternalClients: () => ({
    read: new MockReadAdapter(
      [
        // Mock listings
        {
          id: "listing-1",
          city: "Toronto",
          province: "ON",
          propertyType: "Condo",
          beds: 2,
          baths: 2,
          price: 750000,
        },
      ],
      [
        // Mock underwriting results
        {
          resultId: "result-1",
          metrics: {
            dscr: 1.35,
            cashOnCashPct: 0.09,
            cashFlowAnnual: 2400,
            capRatePct: 0.045,
            irrPct: 0.12,
          },
        },
      ]
    ),
    dispatcher: new MultiChannelDispatcher(sendDevBrowser),
  }),

  healthCheck: {
    intervalMs: 30000, // 30 seconds
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

  shutdownTimeoutMs: 15000, // 15 seconds
};

/**
 * Alerts Service using BaseService template
 */
export class AlertsService extends BaseService<
  AlertsDependencies,
  AlertsEventMap
> {
  constructor() {
    super(alertsServiceConfig);
  }
}
