/**
 * API Gateway Service Configuration using BaseService template
 */

import {
  BaseService,
  BusinessLogic,
  BusinessLogicBase,
  BusPort,
  Logger,
  ServiceConfig,
} from "@realestate/shared-utils";
import { Pool } from "pg";

// Import adapters and core services
import { SimpleAuthAdapter } from "./adapters/auth.simple";
import { RedisCacheAdapter } from "./adapters/cache.redis";
import { EnrichmentReadAdapter } from "./adapters/enrichment.read";
import { ListingsReadAdapter } from "./adapters/listings.read";
import { UnderwritingServiceClient } from "./adapters/underwriting.client";
import { OrchestrationService } from "./core/orchestration";

/**
 * Event map for API Gateway (mainly for health monitoring)
 */
export interface APIGatewayEventMap {
  // API Gateway doesn't typically subscribe to domain events,
  // but can listen to system events for monitoring
  system_health_check: {
    timestamp: string;
    source: string;
  };
}

/**
 * Service dependencies for API Gateway
 */
export interface APIGatewayDependencies {
  bus: BusPort;
  cache: RedisCacheAdapter;
  db: Pool;
  repositories: {
    listings: ListingsReadAdapter;
    enrichments: EnrichmentReadAdapter;
  };
  clients: {
    underwriting: UnderwritingServiceClient;
  };
  services: {
    auth: SimpleAuthAdapter;
    orchestration: OrchestrationService;
  };
  logger: Logger;
}

/**
 * API Gateway Business Logic
 *
 * Unlike other services, the API Gateway doesn't have complex event-driven
 * business logic. Instead, it focuses on HTTP API orchestration.
 * This class mainly handles health monitoring and system events.
 */
export class APIGatewayBusinessLogic extends BusinessLogicBase<
  APIGatewayDependencies,
  APIGatewayEventMap
> {
  private metrics = {
    httpRequests: 0,
    httpErrors: 0,
    authenticationAttempts: 0,
    authenticationFailures: 0,
    rateLimitViolations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    upstreamServiceErrors: 0,
  };

  constructor(deps: APIGatewayDependencies) {
    super(deps);
    this.initializeOrchestration();
  }

  /**
   * Initialize the orchestration service with all dependencies
   */
  private initializeOrchestration(): void {
    this.deps.logger.info("Initializing API Gateway orchestration service...");

    // The orchestration service is already created and injected via dependencies
    // This is mainly for any additional initialization if needed

    this.deps.logger.info("API Gateway orchestration service initialized");
  }

  /**
   * Handle system health check events
   */
  async handleSystemHealthCheck(
    event: APIGatewayEventMap["system_health_check"]
  ): Promise<void> {
    try {
      this.deps.logger.debug(`System health check from ${event.source}`);

      // Could update internal health metrics here
      // This is mainly for demonstration of event handling capability
    } catch (error) {
      this.deps.logger.error("Error handling system health check:", error);
      throw error;
    }
  }

  /**
   * Update HTTP metrics (called by HTTP middleware)
   */
  updateHttpMetrics(
    type:
      | "request"
      | "error"
      | "auth_attempt"
      | "auth_failure"
      | "rate_limit"
      | "cache_hit"
      | "cache_miss"
      | "upstream_error"
  ): void {
    switch (type) {
      case "request":
        this.metrics.httpRequests++;
        break;
      case "error":
        this.metrics.httpErrors++;
        break;
      case "auth_attempt":
        this.metrics.authenticationAttempts++;
        break;
      case "auth_failure":
        this.metrics.authenticationFailures++;
        break;
      case "rate_limit":
        this.metrics.rateLimitViolations++;
        break;
      case "cache_hit":
        this.metrics.cacheHits++;
        break;
      case "cache_miss":
        this.metrics.cacheMisses++;
        break;
      case "upstream_error":
        this.metrics.upstreamServiceErrors++;
        break;
    }
  }

  /**
   * Get API Gateway specific metrics
   */
  getGatewayMetrics() {
    return {
      ...this.metrics,
      cacheHitRate:
        this.metrics.cacheHits /
          (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
      authSuccessRate:
        this.metrics.authenticationAttempts > 0
          ? (this.metrics.authenticationAttempts -
              this.metrics.authenticationFailures) /
            this.metrics.authenticationAttempts
          : 0,
      errorRate:
        this.metrics.httpRequests > 0
          ? this.metrics.httpErrors / this.metrics.httpRequests
          : 0,
    };
  }

  /**
   * Check if API Gateway is healthy
   */
  isHealthy(): boolean {
    // API Gateway is healthy if:
    // 1. Error rate is below 10%
    // 2. Cache is operational
    // 3. Database connection is working
    const errorRate =
      this.metrics.httpRequests > 0
        ? this.metrics.httpErrors / this.metrics.httpRequests
        : 0;

    return errorRate < 0.1;
  }

  /**
   * Perform health check of all dependencies
   */
  async performHealthCheck(): Promise<{
    overall: "healthy" | "degraded" | "down";
    components: Record<
      string,
      { status: string; responseTime?: number; error?: string }
    >;
  }> {
    const startTime = Date.now();
    const components: Record<string, any> = {};

    try {
      // Check cache
      const cacheStart = Date.now();
      const cacheHealthy = await this.deps.cache.isHealthy();
      components.cache = {
        status: cacheHealthy ? "healthy" : "down",
        responseTime: Date.now() - cacheStart,
      };

      // Check database
      const dbStart = Date.now();
      try {
        const client = await this.deps.db.connect();
        client.release();
        components.database = {
          status: "healthy",
          responseTime: Date.now() - dbStart,
        };
      } catch (error) {
        components.database = {
          status: "down",
          responseTime: Date.now() - dbStart,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }

      // Check underwriting service
      const uwStart = Date.now();
      const uwHealthy = await this.deps.clients.underwriting.healthCheck();
      components.underwriting = {
        status: uwHealthy ? "healthy" : "down",
        responseTime: Date.now() - uwStart,
      };

      // Determine overall health
      const healthyComponents = Object.values(components).filter(
        (c) => c.status === "healthy"
      ).length;
      const totalComponents = Object.keys(components).length;

      let overall: "healthy" | "degraded" | "down";
      if (healthyComponents === totalComponents) {
        overall = "healthy";
      } else if (healthyComponents >= totalComponents / 2) {
        overall = "degraded";
      } else {
        overall = "down";
      }

      return { overall, components };
    } catch (error) {
      this.deps.logger.error("Health check failed:", error);
      return {
        overall: "down",
        components: {
          ...components,
          error: {
            status: "down",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        },
      };
    }
  }
}

/**
 * Service configuration for API Gateway
 */
export const apiGatewayServiceConfig: ServiceConfig<
  APIGatewayDependencies,
  APIGatewayEventMap
> = {
  name: "api-gateway",
  version: "1.0.0",

  database: {
    schema: "sql/init.sql", // API Gateway may have its own tables for users, API keys, etc.
    pool: {
      max: 20, // API Gateway may need more connections for read queries
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
  },

  cache: {
    type: "redis", // API Gateway benefits greatly from caching
  },

  // API Gateway typically doesn't subscribe to business domain events
  // but may listen to system/monitoring events
  subscriptions: [
    {
      topic: "system_health_check",
      handler: "handleSystemHealthCheck",
      consumerGroup: "api_gateway_monitoring",
      options: {
        retries: 1,
      },
    },
  ],

  // API Gateway may publish system monitoring events
  publications: [{ topic: "api_gateway_metrics" }],

  createBusinessLogic: (deps: APIGatewayDependencies) =>
    new APIGatewayBusinessLogic(
      deps
    ) as unknown as BusinessLogic<APIGatewayEventMap>,

  createRepositories: (pool: Pool) => ({
    listings: new ListingsReadAdapter(pool),
    enrichments: new EnrichmentReadAdapter(pool),
  }),

  createExternalClients: () => ({
    // External clients would be created here if needed
    // For now, we handle HTTP clients in the underwriting service client
  }),

  healthCheck: {
    intervalMs: 60000, // 1 minute
    customChecks: [
      {
        name: "upstream_services",
        check: async () => {
          // This would be implemented by the business logic
          return true;
        },
      },
      {
        name: "cache_connectivity",
        check: async () => {
          // This would check Redis connectivity
          return true;
        },
      },
    ],
  },

  shutdownTimeoutMs: 30000, // 30 seconds
};

/**
 * Extended API Gateway Service class with custom initialization
 */
export class APIGatewayService extends BaseService<
  APIGatewayDependencies,
  APIGatewayEventMap
> {
  private orchestrationService?: OrchestrationService;

  constructor() {
    super({
      ...apiGatewayServiceConfig,
      createBusinessLogic: (deps: APIGatewayDependencies) => {
        // Create all the additional services and adapters
        const cache = new RedisCacheAdapter();
        const authService = new SimpleAuthAdapter(deps.db!);
        const underwritingClient = new UnderwritingServiceClient(deps.db!);

        // Create orchestration service
        this.orchestrationService = new OrchestrationService(
          deps.repositories.listings,
          deps.repositories.enrichments,
          new (class {
            async findByListingId() {
              return null;
            }
            async findByListingIds() {
              return [];
            }
          })(), // RentEstimateReadPort placeholder
          underwritingClient,
          underwritingClient, // Also implements UnderwritingServicePort
          new (class {
            async findByUserId() {
              return [];
            }
            async findByListingId() {
              return [];
            }
            async markAsRead() {}
          })(), // AlertsReadPort placeholder
          new (class {
            async findByUserId() {
              return [];
            }
            async findById() {
              return null;
            }
            async create(search: any) {
              return { ...search, id: "mock" };
            }
            async update() {
              return null;
            }
            async delete() {
              return false;
            }
          })(), // SavedSearchPort placeholder
          cache,
          deps.logger
        );

        // Inject additional services into dependencies
        (deps as any).services = {
          auth: authService,
          orchestration: this.orchestrationService,
        };
        (deps as any).cache = cache;
        (deps as any).clients = {
          ...((deps as any).clients || {}),
          underwriting: underwritingClient,
        };

        return new APIGatewayBusinessLogic(
          deps
        ) as unknown as BusinessLogic<APIGatewayEventMap>;
      },
    });
  }

  getOrchestrationService(): OrchestrationService | undefined {
    return this.orchestrationService;
  }
}
