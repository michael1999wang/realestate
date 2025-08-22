#!/usr/bin/env node

/**
 * API Gateway HTTP Server
 *
 * Starts the Express HTTP server for the API Gateway.
 * This server handles all external HTTP requests and routes them
 * through the orchestration service to appropriate microservices.
 */

import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Pool } from "pg";

// Import core services and configuration
import { SimpleAuthAdapter } from "../adapters/auth.simple";
import { RedisCacheAdapter } from "../adapters/cache.redis";
import { EnrichmentReadAdapter } from "../adapters/enrichment.read";
import { ListingsReadAdapter } from "../adapters/listings.read";
import { UnderwritingServiceClient } from "../adapters/underwriting.client";
import { apiCfg, dbCfg } from "../config/env";
import { OrchestrationService } from "../core/orchestration";
import { HealthCheckPort } from "../core/ports";
import { APIGatewayMiddleware } from "../http/middleware";
import { APIRoutes } from "../http/routes";

/**
 * Health Check Implementation
 */
class HealthCheckAdapter implements HealthCheckPort {
  constructor(
    private db: Pool,
    private cache: RedisCacheAdapter,
    private services: Record<string, string>
  ) {}

  async checkServiceHealth(serviceName: string): Promise<{
    healthy: boolean;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const baseUrl = this.services[serviceName];
      if (!baseUrl) {
        throw new Error(`Unknown service: ${serviceName}`);
      }

      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        timeout: 5000,
      });

      const responseTime = Date.now() - startTime;
      const healthy = response.ok;

      return { healthy, responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async checkDatabaseHealth(): Promise<boolean> {
    try {
      const client = await this.db.connect();
      client.release();
      return true;
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  }

  async checkCacheHealth(): Promise<boolean> {
    return await this.cache.isHealthy();
  }
}

/**
 * Simple Logger Implementation
 */
class SimpleLogger {
  constructor(private serviceName: string) {}

  debug(message: string, ...args: any[]): void {
    if (apiCfg.isDevelopment) {
      console.debug(`[${this.serviceName}] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    console.log(`[${this.serviceName}] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.serviceName}] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[${this.serviceName}] ${message}`, ...args);
  }
}

/**
 * Initialize and start the HTTP server
 */
async function startServer(): Promise<void> {
  const logger = new SimpleLogger("api-gateway-http");

  try {
    logger.info("🚀 Starting API Gateway HTTP Server...");

    // Initialize database connection
    logger.info("📊 Connecting to database...");
    const dbPool = new Pool({
      host: dbCfg.host,
      port: dbCfg.port,
      user: dbCfg.user,
      password: dbCfg.password,
      database: dbCfg.database,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test database connection
    const dbClient = await dbPool.connect();
    logger.info("✅ Database connected successfully");
    dbClient.release();

    // Initialize Redis cache
    logger.info("🔄 Connecting to Redis cache...");
    const cache = new RedisCacheAdapter();
    const cacheHealthy = await cache.isHealthy();
    if (cacheHealthy) {
      logger.info("✅ Redis cache connected successfully");
    } else {
      logger.warn("⚠️ Redis cache connection failed, continuing without cache");
    }

    // Initialize service adapters (each connects to its own service database)
    logger.info("🏗️ Initializing service adapters...");
    const listingsAdapter = new ListingsReadAdapter(); // Uses serviceDatabases.ingestor
    const enrichmentAdapter = new EnrichmentReadAdapter(); // Uses serviceDatabases.enrichment
    const underwritingClient = new UnderwritingServiceClient(); // Uses serviceDatabases.underwriting
    const authAdapter = new SimpleAuthAdapter(dbPool); // Uses API Gateway's own database

    // Initialize health check adapter
    const serviceUrls = {
      ingestor: "http://localhost:3001",
      enrichment: "http://localhost:3002",
      "rent-estimator": "http://localhost:3003",
      underwriting: "http://localhost:3004",
      alerts: "http://localhost:3005",
    };
    const healthCheck = new HealthCheckAdapter(dbPool, cache, serviceUrls);

    // Create placeholder adapters for services not yet implemented
    const rentEstimateAdapter = {
      async findByListingId() {
        return null;
      },
      async findByListingIds() {
        return [];
      },
    };

    const alertsAdapter = {
      async findByUserId() {
        return [];
      },
      async findByListingId() {
        return [];
      },
      async markAsRead() {},
    };

    const savedSearchAdapter = {
      async findByUserId() {
        return [];
      },
      async findById() {
        return null;
      },
      async create(search: any) {
        return { ...search, id: `search-${Date.now()}` };
      },
      async update() {
        return null;
      },
      async delete() {
        return false;
      },
    };

    // Initialize orchestration service
    logger.info("🎭 Initializing orchestration service...");
    const orchestration = new OrchestrationService(
      listingsAdapter,
      enrichmentAdapter,
      rentEstimateAdapter as any,
      underwritingClient,
      underwritingClient,
      alertsAdapter as any,
      savedSearchAdapter as any,
      cache,
      logger as any
    );

    // Initialize middleware
    const middleware = new APIGatewayMiddleware(
      authAdapter,
      authAdapter,
      cache,
      cache,
      logger as any
    );

    // Initialize routes
    const routes = new APIRoutes(
      orchestration,
      middleware,
      healthCheck,
      logger as any
    );

    // Create Express app
    const app = express();

    // Security middleware
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
      })
    );

    // CORS middleware
    app.use(
      cors({
        origin: apiCfg.corsOrigins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
      })
    );

    // Body parsing middleware
    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true, limit: "1mb" }));

    // Request logging middleware
    app.use(middleware.requestLogger());

    // Store logger for error handling
    app.set("logger", logger);

    // API routes
    app.use(`/api/${apiCfg.apiVersion}`, routes.getRouter());

    // Root health check
    app.get("/health", async (req, res) => {
      try {
        const isHealthy = await healthCheck.checkDatabaseHealth();
        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? "healthy" : "degraded",
          timestamp: new Date().toISOString(),
          service: "api-gateway",
          version: "1.0.0",
        });
      } catch (error) {
        res.status(503).json({
          status: "down",
          timestamp: new Date().toISOString(),
          error: "Health check failed",
          service: "api-gateway",
          version: "1.0.0",
        });
      }
    });

    // API documentation endpoint
    app.get("/", (req, res) => {
      res.json({
        service: "Real Estate API Gateway",
        version: "1.0.0",
        documentation: "/docs",
        health: "/health",
        api: `/api/${apiCfg.apiVersion}`,
        endpoints: {
          properties: `GET /api/${apiCfg.apiVersion}/properties`,
          propertyDetail: `GET /api/${apiCfg.apiVersion}/properties/:id`,
          underwrite: `POST /api/${apiCfg.apiVersion}/underwrite`,
          searches: `GET /api/${apiCfg.apiVersion}/searches`,
          alerts: `GET /api/${apiCfg.apiVersion}/alerts`,
          systemStatus: `GET /api/${apiCfg.apiVersion}/system/status`,
        },
        authentication: apiCfg.enableAuth
          ? "enabled"
          : "disabled (development mode)",
        rateLimit: apiCfg.enableRateLimit ? "enabled" : "disabled",
        cache: apiCfg.enableCache ? "enabled" : "disabled",
      });
    });

    // Error handling middleware
    app.use(middleware.notFoundHandler());
    app.use(middleware.errorHandler());

    // Start HTTP server
    const server = app.listen(apiCfg.port, () => {
      logger.info(
        `✅ API Gateway HTTP Server listening on port ${apiCfg.port}`
      );
      logger.info(
        `🔗 API Base URL: http://localhost:${apiCfg.port}/api/${apiCfg.apiVersion}`
      );
      logger.info(`🔗 Health Check: http://localhost:${apiCfg.port}/health`);
      logger.info(`🔗 Documentation: http://localhost:${apiCfg.port}/`);

      if (!apiCfg.enableAuth) {
        logger.warn("⚠️ Authentication disabled (development mode)");
      }
      if (!apiCfg.enableRateLimit) {
        logger.warn("⚠️ Rate limiting disabled");
      }
      if (!apiCfg.enableCache) {
        logger.warn("⚠️ Caching disabled");
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`🛑 Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        try {
          await dbPool.end();
          await cache.close();
          logger.info("✅ Server shut down successfully");
          process.exit(0);
        } catch (error) {
          logger.error("❌ Error during shutdown:", error);
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error("❌ Forced shutdown after timeout");
        process.exit(1);
      }, 30000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("❌ Failed to start API Gateway HTTP Server:", error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    console.error("💥 API Gateway HTTP Server crashed:", error);
    process.exit(1);
  });
}
