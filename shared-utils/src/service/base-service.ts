import { Pool } from "pg";
import { FullBusAdapter } from "../adapters";
import { createBus } from "../bus";
import { BusPort } from "../bus/types";
import { MemoryCache } from "../cache";
import { ServiceLifecycle } from "./lifecycle";
import {
  BusinessLogic,
  HealthCheck,
  Logger,
  ServiceConfig,
  ServiceDependencies,
  ServiceMetrics,
  ServiceState,
} from "./types";

/**
 * Default console logger implementation
 */
class ConsoleLogger implements Logger {
  constructor(private serviceName: string) {}

  debug(message: string, ...args: any[]): void {
    console.debug(`[${this.serviceName}] ${message}`, ...args);
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
 * Generic base service class that handles all infrastructure concerns
 * Services extend this and provide their business logic via configuration
 */
export class BaseService<
  TDeps extends ServiceDependencies = ServiceDependencies,
  TEventMap = any
> {
  protected lifecycle: ServiceLifecycle;
  protected logger: Logger;
  protected businessLogic?: BusinessLogic<TEventMap>;
  protected dependencies?: TDeps;

  // Infrastructure components
  private dbPool?: Pool;
  private bus?: BusPort;
  private cache?: any;
  private metricsInterval?: NodeJS.Timeout;

  // Metrics
  private metrics: ServiceMetrics = {
    eventsReceived: 0,
    eventsProcessed: 0,
    eventsFailed: 0,
    eventsPublished: 0,
    uptimeSeconds: 0,
    memoryUsageMB: 0,
    isHealthy: false,
  };

  constructor(private config: ServiceConfig<TDeps, TEventMap>) {
    this.lifecycle = new ServiceLifecycle(config.shutdownTimeoutMs);
    this.logger = new ConsoleLogger(config.name);

    this.setupLifecycleHandlers();
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    try {
      this.lifecycle.setState(ServiceState.STARTING);
      this.logger.info(
        `Starting ${this.config.name} v${this.config.version}...`
      );

      // Initialize infrastructure in order
      await this.initializeDatabase();
      await this.initializeCache();
      await this.initializeBus();
      await this.initializeExternalClients();
      await this.initializeRepositories();
      await this.initializeBusinessLogic();
      await this.subscribeToEvents();
      await this.startMetrics();
      await this.startHealthChecks();

      this.lifecycle.setState(ServiceState.RUNNING);
      this.logger.info(`${this.config.name} service started successfully! 🎉`);

      // Log configuration summary
      this.logConfigurationSummary();

      // Wait for shutdown
      await this.lifecycle.waitForShutdown();
    } catch (error) {
      this.lifecycle.handleError(error as Error, "startup");
      throw error;
    }
  }

  /**
   * Get current service metrics
   */
  getMetrics(): ServiceMetrics {
    return {
      ...this.metrics,
      uptimeSeconds: this.lifecycle.getUptimeSeconds(),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      isHealthy: this.lifecycle.isHealthy(),
    };
  }

  /**
   * Publish an event to the bus
   */
  protected async publish(topic: string, data: any): Promise<void> {
    if (!this.bus) {
      throw new Error("Bus not initialized");
    }

    try {
      await this.bus.publish({
        type: topic,
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        source: this.config.name,
        data,
        version: this.config.version,
      } as any);

      this.metrics.eventsPublished++;
    } catch (error) {
      this.logger.error(`Failed to publish event to ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    if (!this.config.database) {
      this.logger.debug(
        "No database configuration, skipping database initialization"
      );
      return;
    }

    this.logger.info("Initializing database connection...");

    const dbConfig = this.getDbConfig();
    this.dbPool = new Pool(dbConfig);

    // Test connection
    const client = await this.dbPool.connect();
    this.logger.info("Database connection established successfully");
    client.release();

    // Add to shutdown handlers
    this.lifecycle.addShutdownHandler(async () => {
      this.logger.info("Closing database connections...");
      if (this.dbPool) {
        await this.dbPool.end();
      }
    });
  }

  /**
   * Initialize cache
   */
  private async initializeCache(): Promise<void> {
    if (!this.config.cache) {
      this.logger.debug(
        "No cache configuration, skipping cache initialization"
      );
      return;
    }

    this.logger.info(`Initializing ${this.config.cache.type} cache...`);

    if (this.config.cache.type === "memory") {
      this.cache = new MemoryCache();
    } else {
      // Redis cache would be implemented here
      this.logger.info("Redis cache not yet implemented, using memory cache");
      this.cache = new MemoryCache();
    }

    this.logger.info("Cache initialized successfully");
  }

  /**
   * Initialize message bus
   */
  private async initializeBus(): Promise<void> {
    this.logger.info("Initializing message bus...");

    const busConfig = this.getBusConfig();
    const sharedBus = createBus(busConfig);
    this.bus = new FullBusAdapter(sharedBus);

    this.logger.info("Message bus initialized successfully");

    // Add to shutdown handlers
    this.lifecycle.addShutdownHandler(async () => {
      this.logger.info("Closing message bus connections...");
      if (this.bus?.close) {
        await this.bus.close();
      }
    });
  }

  /**
   * Initialize external API clients
   */
  private async initializeExternalClients(): Promise<void> {
    if (!this.config.external || !this.config.createExternalClients) {
      this.logger.debug("No external clients configuration, skipping");
      return;
    }

    this.logger.info("Initializing external API clients...");
    // This would be implemented by each service if needed
    this.logger.info("External clients initialized");
  }

  /**
   * Initialize repositories
   */
  private async initializeRepositories(): Promise<void> {
    if (!this.config.createRepositories || !this.dbPool) {
      this.logger.debug("No repositories configuration or database, skipping");
      return;
    }

    this.logger.info("Initializing repositories...");
    // This would create service-specific repositories
    this.logger.info("Repositories initialized");
  }

  /**
   * Initialize business logic
   */
  private async initializeBusinessLogic(): Promise<void> {
    this.logger.info("Initializing business logic...");

    this.dependencies = {
      bus: this.bus!,
      cache: this.cache,
      db: this.dbPool,
      repositories: this.config.createRepositories?.(this.dbPool!) ?? {},
      clients:
        this.config.createExternalClients?.(this.config.external ?? []) ?? {},
      logger: this.logger,
    } as TDeps;

    this.businessLogic = this.config.createBusinessLogic(this.dependencies);
    this.logger.info("Business logic initialized");
  }

  /**
   * Subscribe to configured events
   */
  private async subscribeToEvents(): Promise<void> {
    if (!this.bus || !this.businessLogic) {
      throw new Error("Bus or business logic not initialized");
    }

    this.logger.info("Setting up event subscriptions...");

    for (const subscription of this.config.subscriptions) {
      const handlerName = subscription.handler as string;
      const handler =
        this.businessLogic[handlerName as keyof BusinessLogic<TEventMap>];

      if (typeof handler !== "function") {
        throw new Error(
          `Handler method ${handlerName} not found in business logic`
        );
      }

      // Wrap handler with metrics and error handling
      const wrappedHandler = async (event: any) => {
        this.metrics.eventsReceived++;
        const startTime = Date.now();

        try {
          await (handler as Function).call(this.businessLogic, event);
          this.metrics.eventsProcessed++;
          this.metrics.lastProcessedAt = new Date().toISOString();
        } catch (error) {
          this.metrics.eventsFailed++;
          this.metrics.lastErrorAt = new Date().toISOString();
          this.metrics.lastError =
            error instanceof Error ? error.message : String(error);

          this.logger.error(
            `Error handling ${subscription.topic as string} event:`,
            error
          );

          // Optionally re-throw or handle DLQ logic here
          throw error;
        }
      };

      await this.bus.subscribe(subscription.topic as string, wrappedHandler);

      this.logger.info(`Subscribed to ${subscription.topic as string} events`);
    }

    this.logger.info(
      `Successfully subscribed to ${this.config.subscriptions.length} event types`
    );
  }

  /**
   * Start metrics collection
   */
  private async startMetrics(): Promise<void> {
    const metricsInterval = 60000; // 1 minute

    this.metricsInterval = setInterval(() => {
      if (this.lifecycle.getState() === ServiceState.RUNNING) {
        const metrics = this.getMetrics();
        this.logger.info("Service metrics:", {
          eventsReceived: metrics.eventsReceived,
          eventsProcessed: metrics.eventsProcessed,
          eventsFailed: metrics.eventsFailed,
          eventsPublished: metrics.eventsPublished,
          uptimeSeconds: metrics.uptimeSeconds,
          memoryUsageMB: metrics.memoryUsageMB,
          isHealthy: metrics.isHealthy,
        });
      }
    }, metricsInterval);

    // Add to shutdown handlers
    this.lifecycle.addShutdownHandler(async () => {
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }
    });

    this.logger.info("Metrics collection started");
  }

  /**
   * Start health checks
   */
  private async startHealthChecks(): Promise<void> {
    if (!this.config.healthCheck) {
      this.logger.debug("No health check configuration, skipping");
      return;
    }

    const intervalMs = this.config.healthCheck.intervalMs || 30000; // 30 seconds
    const customChecks = this.config.healthCheck.customChecks || [];

    const healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks(customChecks);
      } catch (error) {
        this.logger.error("Health check failed:", error);
      }
    }, intervalMs);

    // Add to shutdown handlers
    this.lifecycle.addShutdownHandler(async () => {
      clearInterval(healthCheckInterval);
    });

    this.logger.info("Health checks started");
  }

  /**
   * Perform health checks
   */
  private async performHealthChecks(
    customChecks: HealthCheck[]
  ): Promise<void> {
    const checks = [
      ...customChecks,
      // Add standard health checks here if needed
    ];

    if (checks.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      checks.map((check) => check.check())
    );

    const failures = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === "rejected" || !result.value);

    if (failures.length > 0) {
      this.logger.warn(
        `Health check failures: ${failures.length}/${checks.length}`
      );
    } else {
      this.logger.debug("All health checks passed");
    }
  }

  /**
   * Setup lifecycle event handlers
   */
  private setupLifecycleHandlers(): void {
    this.lifecycle.on("error", ({ error, context }) => {
      this.logger.error(`Service error in ${context}:`, error);
    });

    this.lifecycle.on("state:changed", ({ from, to }) => {
      this.logger.info(`State transition: ${from} → ${to}`);
    });
  }

  /**
   * Log configuration summary
   */
  private logConfigurationSummary(): void {
    this.logger.info(`Configuration summary:
      • Version: ${this.config.version}
      • Database: ${this.config.database ? "enabled" : "disabled"}
      • Cache: ${this.config.cache?.type || "disabled"}
      • Subscriptions: ${this.config.subscriptions.length}
      • Publications: ${this.config.publications?.length || 0}
      • External APIs: ${this.config.external?.length || 0}`);
  }

  /**
   * Get database configuration from environment
   */
  private getDbConfig() {
    return {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "password",
      database: process.env.DB_NAME || this.config.name,
      max: this.config.database?.pool?.max || 10,
      idleTimeoutMillis: this.config.database?.pool?.idleTimeoutMillis || 30000,
      connectionTimeoutMillis:
        this.config.database?.pool?.connectionTimeoutMillis || 5000,
    };
  }

  /**
   * Get bus configuration from environment
   */
  private getBusConfig() {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const busType = process.env.BUS_TYPE || "redis";

    return {
      type: busType as "redis" | "memory",
      serviceName: this.config.name,
      redisUrl: busType === "redis" ? redisUrl : undefined,
    };
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
