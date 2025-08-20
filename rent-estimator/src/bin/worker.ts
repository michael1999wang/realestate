#!/usr/bin/env node

import { config } from "../config/env";
import { DebounceService } from "../core/debounce";
import { estimateForListing } from "../core/estimate";

// Adapters
import { createBus } from "@realestate/shared-utils";
import { BusAdapter } from "../adapters/bus.adapter";
import { RedisBus } from "../adapters/bus.redis";
import { MemoryCache } from "../adapters/cache.memory";
import { RedisCache } from "../adapters/cache.redis";
import { MockCompsSource } from "../adapters/comps.source";
import { MockPriorsSource } from "../adapters/priors.source";
import { MockReadAdapter } from "../adapters/read.mock";
import { MemoryRentRepo } from "../adapters/repo.memory";
import { SqlRentRepo } from "../adapters/repo.sql";

// Types
import { DataEnrichedEvt, ListingChangedEvt } from "../core/dto";
import {
  BusPort,
  CachePort,
  CompsPort,
  PriorsPort,
  ReadPort,
  RentRepoPort,
} from "../core/ports";

class RentEstimatorWorker {
  private deps: {
    read: ReadPort;
    rentRepo: RentRepoPort;
    priors: PriorsPort;
    comps: CompsPort;
    cache: CachePort;
    bus: BusPort;
  };
  private debounceService: DebounceService;
  private isRunning = false;

  constructor(deps: {
    read: ReadPort;
    rentRepo: RentRepoPort;
    priors: PriorsPort;
    comps: CompsPort;
    cache: CachePort;
    bus: BusPort;
  }) {
    this.deps = deps;
    this.debounceService = new DebounceService(deps.cache);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("Worker is already running");
      return;
    }

    console.log("Starting rent estimator worker...");
    this.isRunning = true;

    try {
      // Subscribe to events
      await this.deps.bus.subscribe(
        "listing_changed",
        this.handleListingChanged.bind(this)
      );
      await this.deps.bus.subscribe(
        "data_enriched",
        this.handleDataEnriched.bind(this)
      );

      console.log("Worker started successfully");
      console.log("Subscribed to: listing_changed, data_enriched");
      console.log("Publishing: underwrite_requested");

      // Keep the process alive
      await this.keepAlive();
    } catch (error) {
      console.error("Error starting worker:", error);
      this.isRunning = false;
      throw error;
    }
  }

  private async handleListingChanged(event: ListingChangedEvt): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`Processing listing_changed event for listing ${event.id}`);

      // Check if address is dirty (force immediate processing)
      const isDirtyAddress = event.dirty?.includes("address") ?? false;

      // Apply debouncing unless address is dirty
      const shouldProcess = await this.debounceService.shouldProcess(
        event.id,
        isDirtyAddress
      );
      if (!shouldProcess) {
        console.log(
          `Skipping processing for listing ${event.id} due to debouncing`
        );
        return;
      }

      // Process the listing
      const result = await estimateForListing(event.id, this.deps);

      const duration = Date.now() - startTime;

      console.log(`Processed listing ${event.id}:`, {
        listingId: event.id,
        method: result.estimate?.method,
        comps_n: result.estimate?.featuresUsed.comps?.length ?? 0,
        p50: result.estimate?.p50,
        changed: result.changed,
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Error processing listing_changed event for ${event.id}:`, {
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration,
      });
    }
  }

  private async handleDataEnriched(event: DataEnrichedEvt): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`Processing data_enriched event for listing ${event.id}`);

      // Always process data enriched events (no debouncing)
      const result = await estimateForListing(event.id, this.deps);

      const duration = Date.now() - startTime;

      console.log(`Processed enriched data for listing ${event.id}:`, {
        listingId: event.id,
        method: result.estimate?.method,
        comps_n: result.estimate?.featuresUsed.comps?.length ?? 0,
        p50: result.estimate?.p50,
        changed: result.changed,
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Error processing data_enriched event for ${event.id}:`, {
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration,
      });
    }
  }

  private async keepAlive(): Promise<void> {
    // Keep the process alive and handle graceful shutdown
    process.on("SIGINT", this.handleShutdown.bind(this));
    process.on("SIGTERM", this.handleShutdown.bind(this));

    // Health check interval
    const healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error("Health check failed:", error);
      }
    }, 30000); // Every 30 seconds

    // Keep alive
    return new Promise((resolve) => {
      const cleanup = () => {
        clearInterval(healthCheckInterval);
        resolve();
      };

      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
    });
  }

  private async performHealthCheck(): Promise<void> {
    const checks = [
      {
        name: "cache",
        check: () =>
          this.deps.cache instanceof RedisCache
            ? (this.deps.cache as RedisCache).isHealthy()
            : Promise.resolve(true),
      },
      {
        name: "bus",
        check: () =>
          this.deps.bus instanceof RedisBus
            ? (this.deps.bus as RedisBus).isHealthy()
            : Promise.resolve(true),
      },
      {
        name: "repo",
        check: () =>
          this.deps.rentRepo instanceof SqlRentRepo
            ? (this.deps.rentRepo as SqlRentRepo).isHealthy()
            : Promise.resolve(true),
      },
    ];

    const results = await Promise.allSettled(
      checks.map(async ({ name, check }) => {
        const healthy = await check();
        return { name, healthy };
      })
    );

    const failures = results
      .filter((result) => result.status === "rejected" || !result.value.healthy)
      .map((result) =>
        result.status === "fulfilled" ? result.value.name : "unknown"
      );

    if (failures.length > 0) {
      console.warn("Health check failures:", failures);
    } else {
      console.log("Health check: All systems healthy");
    }
  }

  private async handleShutdown(): Promise<void> {
    console.log("Received shutdown signal, gracefully shutting down...");
    this.isRunning = false;

    try {
      // Close connections
      if (this.deps.bus instanceof RedisBus) {
        await (this.deps.bus as RedisBus).close();
      }
      if (this.deps.cache instanceof RedisCache) {
        await (this.deps.cache as RedisCache).close();
      }
      if (this.deps.rentRepo instanceof SqlRentRepo) {
        await (this.deps.rentRepo as SqlRentRepo).close();
      }

      console.log("Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  }

  stop(): void {
    this.isRunning = false;
  }
}

// Factory function to create dependencies based on environment
function createDependencies(): {
  read: ReadPort;
  rentRepo: RentRepoPort;
  priors: PriorsPort;
  comps: CompsPort;
  cache: CachePort;
  bus: BusPort;
} {
  const useMemory =
    process.env.NODE_ENV === "test" || process.env.USE_MEMORY === "true";

  if (useMemory) {
    console.log("Using memory adapters for development/testing");
    return {
      read: new MockReadAdapter(),
      rentRepo: new MemoryRentRepo(),
      priors: new MockPriorsSource(),
      comps: new MockCompsSource(),
      cache: new MemoryCache(),
      bus: new BusAdapter(
        createBus({ type: "memory", serviceName: "rent-estimator" })
      ),
    };
  }

  console.log("Using production adapters (SQL + Redis)");
  return {
    read: new MockReadAdapter(), // TODO: Replace with actual read adapter
    rentRepo: new SqlRentRepo({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
    }),
    priors: new MockPriorsSource(), // TODO: Replace with actual priors source
    comps: new MockCompsSource(), // TODO: Replace with actual comps source
    cache: new RedisCache(config.redis),
    bus: new BusAdapter(
      createBus({
        type: "redis",
        serviceName: "rent-estimator",
        redisUrl: config.redis,
      })
    ),
  };
}

// Main execution
async function main(): Promise<void> {
  try {
    const deps = createDependencies();
    const worker = new RentEstimatorWorker(deps);

    await worker.start();
  } catch (error) {
    console.error("Failed to start worker:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { createDependencies, RentEstimatorWorker };
