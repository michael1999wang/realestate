/**
 * Alerts Service Configuration using BaseService template
 */

// import { createServiceConfig } from "@realestate/shared-utils/config";
import { BaseService, ServiceConfig } from "@realestate/shared-utils/service";
import { Pool } from "pg";
import { sendDevBrowser } from "./adapters/delivery.devbrowser";
import { MockReadAdapter } from "./adapters/read.mock";
import { MemoryAlertsRepo } from "./adapters/repo.memory";
import { PostgresAlertsRepo } from "./adapters/repo.sql";
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
      await this.deps.repositories.alerts.listActiveSavedSearches();

    for (const search of savedSearches) {
      // Get listing details
      const listing = await this.deps.clients.read.getListingSnapshot(event.id);
      if (!listing) {
        this.deps.logger.warn(
          `Listing ${event.id} not found, skipping alert check`
        );
        continue;
      }

      // Get underwriting results
      const metrics = await this.deps.clients.read.getUnderwriteMetrics(
        event.resultId
      );
      if (!metrics) {
        this.deps.logger.warn(
          `Metrics ${event.resultId} not found, skipping alert check`
        );
        continue;
      }

      const result = { metrics };

      // Check if listing matches search criteria and thresholds
      const matchesCriteria = this.matchesSearchCriteria(listing, search);
      const meetsThresholds = this.meetsThresholds(metrics, search.thresholds);
      const meetsScoreThreshold =
        search.thresholds.minScore &&
        event.score &&
        event.score >= search.thresholds.minScore;

      if (matchesCriteria && (meetsThresholds || meetsScoreThreshold)) {
        // Create alert
        const alert = {
          id: this.generateAlertId(),
          userId: search.userId,
          listingId: event.id,
          resultId: event.resultId,
          savedSearchId: search.id,
          payload: {
            snapshot: listing,
            metrics: metrics,
            score: event.score,
            matched: this.getMatchedThresholds(
              metrics,
              search.thresholds,
              event.score
            ),
          },
          delivery: {
            channels: search.notify.channel,
            statusByChannel: {},
          },
          createdAt: new Date().toISOString(),
        };

        await this.deps.repositories.alerts.insertAlert(alert);

        // Dispatch notifications
        for (const channel of alert.delivery.channels) {
          switch (channel) {
            case "devbrowser":
              await this.deps.clients.dispatcher.sendDevBrowser(alert);
              break;
            case "email":
              await this.deps.clients.dispatcher.sendEmail(alert);
              break;
            case "sms":
              await this.deps.clients.dispatcher.sendSMS(alert);
              break;
            case "slack":
              await this.deps.clients.dispatcher.sendSlack(alert);
              break;
            case "webhook":
              await this.deps.clients.dispatcher.sendWebhook(alert);
              break;
          }
        }

        this.deps.logger.info(
          `Alert created for user ${search.userId}, listing ${event.id}`
        );

        // Publish alert fired event
        await this.deps.bus.publish({
          type: "alerts_fired",
          id: `alert-${alert.id}`,
          timestamp: new Date().toISOString(),
          data: {
            userId: search.userId,
            listingId: event.id,
            resultId: event.resultId,
          },
          version: "1.0.0",
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
    // If there are no financial thresholds defined, don't match based on metrics
    const hasFinancialThresholds =
      thresholds.minDSCR ||
      thresholds.minCoC ||
      thresholds.requireNonNegativeCF;
    if (!hasFinancialThresholds) return false;

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

  /**
   * Get matched thresholds for display
   */
  private getMatchedThresholds(
    metrics: any,
    thresholds: any,
    score?: number
  ): string[] {
    const matched: string[] = [];

    if (thresholds.minDSCR && metrics.dscr >= thresholds.minDSCR) {
      matched.push(`dscr>=${thresholds.minDSCR}`);
    }
    if (thresholds.minCoC && metrics.cashOnCashPct >= thresholds.minCoC) {
      matched.push(`coc>=${thresholds.minCoC}`);
    }
    if (thresholds.requireNonNegativeCF && metrics.cashFlowAnnual >= 0) {
      matched.push("cf>=0");
    }
    if (thresholds.minScore && score && score >= thresholds.minScore) {
      matched.push(`score>=${thresholds.minScore}`);
    }

    return matched;
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
    process.env.NODE_ENV === "production"
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
      process.env.NODE_ENV === "development"
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
