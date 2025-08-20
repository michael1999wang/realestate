#!/usr/bin/env node

import { createBus } from "@realestate/shared-utils";
import { Pool } from "pg";
import { BusAdapter } from "../adapters/bus.adapter";
import { SnapshotsReadAdapter } from "../adapters/read.snapshots";
import {
  SqlAssumptionsRepo,
  SqlFactorsRepo,
  SqlUWRepo,
} from "../adapters/repo.sql";
import { dbCfg, gridCfg, redisUrl } from "../config/env";
import { createHandlers } from "../core/handlers";

// Graceful shutdown handling
let isShuttingDown = false;
const shutdownHandlers: Array<() => Promise<void>> = [];

/**
 * Main worker process
 */
async function main(): Promise<void> {
  console.log("🚀 Starting Underwriting Service Worker...");
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Grid config: ${JSON.stringify(gridCfg)}`);

  try {
    // Initialize database connection
    console.log("📊 Connecting to database...");
    const dbPool = new Pool({
      host: dbCfg.host,
      port: dbCfg.port,
      user: dbCfg.user,
      password: dbCfg.password,
      database: dbCfg.name,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test database connection
    const dbClient = await dbPool.connect();
    console.log("✅ Database connected successfully");
    dbClient.release();

    // Add database cleanup to shutdown handlers
    shutdownHandlers.push(async () => {
      console.log("🔌 Closing database connections...");
      await dbPool.end();
    });

    // Initialize Redis bus
    console.log("🔄 Connecting to Redis bus...");
    const sharedBus = createBus({
      type: "redis",
      serviceName: "underwriting",
      redisUrl: redisUrl,
    });
    const busPort = new BusAdapter(sharedBus);

    // Add bus cleanup to shutdown handlers
    shutdownHandlers.push(async () => {
      console.log("🔌 Closing Redis connections...");
      if (busPort.close) {
        await busPort.close();
      }
    });

    // Initialize repositories
    console.log("🏗️  Initializing repositories...");
    const snapshotRepo = new SnapshotsReadAdapter(dbPool);
    const assumptionsRepo = new SqlAssumptionsRepo(dbPool);
    const uwRepo = new SqlUWRepo(dbPool);
    const factorsRepo = new SqlFactorsRepo(dbPool);

    // Create and configure handlers
    console.log("⚙️  Setting up event handlers...");
    const handlers = createHandlers(
      snapshotRepo,
      assumptionsRepo,
      uwRepo,
      factorsRepo,
      busPort
    );

    // Subscribe to events
    await handlers.subscribeToEvents();
    console.log("📡 Subscribed to events successfully");

    // Start metrics logging
    startMetricsLogging();

    console.log("✅ Underwriting Service Worker is ready!");
    console.log(
      "📊 Listening for underwrite_requested and listing_changed events..."
    );

    // Keep the process running
    await waitForShutdown();
  } catch (error) {
    console.error("❌ Failed to start worker:", error);
    process.exit(1);
  }
}

/**
 * Start periodic metrics logging
 */
function startMetricsLogging(): void {
  const metricsInterval = setInterval(() => {
    if (isShuttingDown) {
      clearInterval(metricsInterval);
      return;
    }

    // Log basic process metrics
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    console.log(
      `📈 Metrics - Uptime: ${Math.floor(uptime)}s, Memory: ${Math.round(
        memUsage.heapUsed / 1024 / 1024
      )}MB`
    );
  }, 60000); // Log every minute

  // Add to shutdown handlers
  shutdownHandlers.push(async () => {
    clearInterval(metricsInterval);
  });
}

/**
 * Wait for shutdown signal
 */
async function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    // Handle various shutdown signals
    const signals = ["SIGTERM", "SIGINT", "SIGUSR2"];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        if (isShuttingDown) return;

        console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
        isShuttingDown = true;

        try {
          // Run all shutdown handlers
          await Promise.all(shutdownHandlers.map((handler) => handler()));
          console.log("✅ Graceful shutdown completed");
          resolve();
        } catch (error) {
          console.error("❌ Error during shutdown:", error);
          resolve();
        }
      });
    });
  });
}

/**
 * Handle uncaught exceptions
 */
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the worker
if (require.main === module) {
  main().catch((error) => {
    console.error("💥 Worker crashed:", error);
    process.exit(1);
  });
}
