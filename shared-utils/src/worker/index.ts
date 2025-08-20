/**
 * Shared worker utilities for microservices
 */

import { Pool } from "pg";
import { DatabaseConfig, RedisConfig } from "../config";
import { createBus, BusFactoryConfig } from "../bus";

export interface WorkerDependencies {
  dbPool?: Pool;
  busPort?: any;
  [key: string]: any;
}

export interface WorkerMetrics {
  startedAt: string;
  eventsProcessed: number;
  errors: number;
  lastProcessedAt?: string;
  lastErrorAt?: string;
  lastError?: string;
}

/**
 * Base worker class with common initialization and cleanup logic
 */
export abstract class BaseWorker {
  protected isRunning = false;
  protected shutdownHandlers: Array<() => Promise<void>> = [];
  protected metrics: WorkerMetrics = {
    startedAt: new Date().toISOString(),
    eventsProcessed: 0,
    errors: 0,
  };

  constructor(protected serviceName: string) {
    this.setupSignalHandlers();
  }

  /**
   * Initialize database connection
   */
  protected async initializeDatabase(dbConfig: DatabaseConfig): Promise<Pool> {
    console.log("📊 Connecting to database...");
    
    const dbPool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.name,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test database connection
    const dbClient = await dbPool.connect();
    console.log("✅ Database connected successfully");
    dbClient.release();

    // Add database cleanup to shutdown handlers
    this.shutdownHandlers.push(async () => {
      console.log("🔌 Closing database connections...");
      await dbPool.end();
    });

    return dbPool;
  }

  /**
   * Initialize bus connection
   */
  protected async initializeBus(redisConfig: RedisConfig): Promise<any> {
    console.log("🔄 Connecting to Redis bus...");
    
    const sharedBus = createBus({
      type: "redis",
      serviceName: this.serviceName,
      redisUrl: redisConfig.url,
    });

    // Add bus cleanup to shutdown handlers
    this.shutdownHandlers.push(async () => {
      console.log("🔌 Closing Redis connections...");
      if (sharedBus.close) {
        await sharedBus.close();
      }
    });

    return sharedBus;
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error(`${this.serviceName} worker is already running`);
    }

    console.log(`🚀 Starting ${this.serviceName} worker...`);
    
    try {
      await this.initialize();
      this.isRunning = true;
      this.startMetricsLogging();
      
      console.log(`✅ ${this.serviceName} Worker is ready!`);
    } catch (error) {
      console.error(`❌ Failed to start ${this.serviceName} worker:`, error);
      await this.shutdown();
      throw error;
    }
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log(`🛑 Stopping ${this.serviceName} worker...`);
    this.isRunning = false;
    
    await this.shutdown();
    console.log(`✅ ${this.serviceName} worker stopped`);
  }

  /**
   * Abstract method for service-specific initialization
   */
  protected abstract initialize(): Promise<void>;

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals = ["SIGINT", "SIGTERM", "SIGUSR2"];
    
    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
        await this.stop();
        process.exit(0);
      });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("💥 Uncaught exception:", error);
      this.stop().finally(() => process.exit(1));
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 Unhandled rejection at:", promise, "reason:", reason);
      this.stop().finally(() => process.exit(1));
    });
  }

  /**
   * Execute shutdown handlers in reverse order
   */
  private async shutdown(): Promise<void> {
    const handlers = [...this.shutdownHandlers].reverse();
    
    for (const handler of handlers) {
      try {
        await handler();
      } catch (error) {
        console.error("Error during shutdown:", error);
      }
    }
    
    this.shutdownHandlers = [];
  }

  /**
   * Start periodic metrics logging
   */
  private startMetricsLogging(): void {
    const logInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(logInterval);
        return;
      }

      const uptime = Date.now() - new Date(this.metrics.startedAt).getTime();
      const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(1);
      
      console.log(`📊 [${this.serviceName}] Metrics:`, {
        uptime: `${uptimeHours}h`,
        eventsProcessed: this.metrics.eventsProcessed,
        errors: this.metrics.errors,
        lastProcessed: this.metrics.lastProcessedAt,
      });
    }, 5 * 60 * 1000); // Every 5 minutes

    // Add cleanup for the interval
    this.shutdownHandlers.push(async () => {
      clearInterval(logInterval);
    });
  }

  /**
   * Update metrics after processing an event
   */
  protected updateMetrics(success: boolean, error?: Error): void {
    if (success) {
      this.metrics.eventsProcessed++;
      this.metrics.lastProcessedAt = new Date().toISOString();
    } else {
      this.metrics.errors++;
      this.metrics.lastErrorAt = new Date().toISOString();
      this.metrics.lastError = error?.message || "Unknown error";
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): WorkerMetrics {
    return { ...this.metrics };
  }
}

/**
 * Utility function to create a standard worker main function
 */
export function createWorkerMain(
  workerFactory: () => BaseWorker
): () => Promise<void> {
  return async () => {
    const worker = workerFactory();
    await worker.start();
  };
}
