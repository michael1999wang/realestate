#!/usr/bin/env node

import { Pool } from "pg";
import { LogBus } from "../adapters/bus.log";
import { MemoryCache } from "../adapters/cache.memory";
import { RedisCache } from "../adapters/cache.redis";
import { CMHCAPI } from "../adapters/cmhc.api";
import { GeocoderAPI } from "../adapters/geocode.api";
import { MemoryListingRepo } from "../adapters/repo.memory"; // TODO: Replace with actual listing repo
import { SQLEnrichmentRepo } from "../adapters/repo.sql";
import { TaxesTable } from "../adapters/taxes.table";
import { WalkScoreAPI } from "../adapters/walkscore.api";
import { apiCfg, appCfg, cacheCfg, dbCfg } from "../config/env";
import { EnrichmentScheduler } from "../core/scheduler";

class EnrichmentWorker {
  private scheduler?: EnrichmentScheduler;
  private pgPool?: Pool;
  private cache!: RedisCache | MemoryCache;

  async start(): Promise<void> {
    console.log("🚀 Starting Enrichment Service Worker...");

    try {
      // Initialize database connection
      this.pgPool = new Pool({
        host: dbCfg.host,
        port: dbCfg.port,
        user: dbCfg.user,
        password: dbCfg.password,
        database: dbCfg.name,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Test database connection
      const client = await this.pgPool.connect();
      console.log("✅ Database connection established");
      client.release();

      // Initialize cache
      if (appCfg.mode === "dev" && !process.env.REDIS_HOST) {
        console.log("📝 Using memory cache (development mode)");
        this.cache = new MemoryCache() as any; // Type cast for compatibility
      } else {
        console.log("🔄 Connecting to Redis cache...");
        this.cache = new RedisCache({
          host: cacheCfg.host,
          port: cacheCfg.port,
        });
        await this.cache.connect();
        console.log("✅ Redis cache connected");
      }

      // Initialize repositories
      const enrRepo = new SQLEnrichmentRepo(this.pgPool);

      // TODO: Replace with actual listing repository that connects to your listings service/database
      const listingRepo = new MemoryListingRepo();
      this.seedMockListings(listingRepo);

      // Initialize message bus
      const bus = new LogBus(); // TODO: Replace with SQSBus in production

      // Initialize external API clients
      const walkScore = new WalkScoreAPI(
        apiCfg.walkscoreKey,
        apiCfg.walkscoreKey ? false : true // Use mock mode if no API key
      );

      const cmhc = new CMHCAPI(apiCfg.cmhcMode === "mock");

      const geocoder = new GeocoderAPI(
        apiCfg.geocodeProvider as any,
        apiCfg.geocodeKey
      );

      const taxes = new TaxesTable();

      // Initialize scheduler
      this.scheduler = new EnrichmentScheduler(
        {
          listingRepo,
          enrRepo,
          bus,
          cache: this.cache,
          walk: walkScore,
          cmhc,
          taxes,
          geo: geocoder,
        },
        {
          debounceTimeoutSec: appCfg.debounceTimeoutSec,
          publishUnderwriteEvents: true,
          logLevel: appCfg.logLevel as any,
        }
      );

      // Start the scheduler
      await this.scheduler.start();

      console.log("🎉 Enrichment Service Worker started successfully");
      console.log(`📊 Configuration:
        - Mode: ${appCfg.mode}
        - Database: ${dbCfg.host}:${dbCfg.port}/${dbCfg.name}
        - Cache: ${
          this.cache instanceof MemoryCache
            ? "Memory"
            : `Redis ${cacheCfg.host}:${cacheCfg.port}`
        }
        - Geocoder: ${apiCfg.geocodeProvider}
        - CMHC: ${apiCfg.cmhcMode}
        - Debounce: ${appCfg.debounceTimeoutSec}s`);

      // Health check endpoint simulation (in real app, this would be an HTTP server)
      this.startHealthCheck();
    } catch (error) {
      console.error("❌ Failed to start Enrichment Service Worker:", error);
      process.exit(1);
    }
  }

  private seedMockListings(listingRepo: MemoryListingRepo): void {
    // Add some test listings for development
    const mockListings = [
      {
        id: "listing-toronto-1",
        updatedAt: "2024-01-01T00:00:00Z",
        address: {
          street: "123 King St W",
          city: "Toronto",
          province: "ON",
          postalCode: "M5V 3A1",
          lat: 43.6532,
          lng: -79.3832,
        },
        listPrice: 850000,
        taxesAnnual: 5400,
        condoFeeMonthly: 420,
        propertyType: "Condo",
      },
      {
        id: "listing-toronto-2",
        updatedAt: "2024-01-01T00:00:00Z",
        address: {
          street: "456 Queen St E",
          city: "Toronto",
          province: "ON",
          postalCode: "M5A 1S2",
        },
        listPrice: 650000,
        propertyType: "Apartment",
      },
      {
        id: "listing-vancouver-1",
        updatedAt: "2024-01-01T00:00:00Z",
        address: {
          street: "789 Robson St",
          city: "Vancouver",
          province: "BC",
          postalCode: "V6Z 1A1",
        },
        listPrice: 1200000,
        condoFeeMonthly: 380,
        propertyType: "Condo",
      },
    ];

    for (const listing of mockListings) {
      listingRepo.setListing(listing);
    }

    console.log(
      `📝 Seeded ${mockListings.length} mock listings for development`
    );
  }

  private startHealthCheck(): void {
    setInterval(() => {
      if (this.scheduler) {
        const metrics = this.scheduler.getMetrics();
        const isHealthy = this.scheduler.isHealthy();

        console.log(
          `💓 Health Check - ${isHealthy ? "HEALTHY" : "UNHEALTHY"}`,
          {
            timestamp: new Date().toISOString(),
            metrics: {
              eventsReceived: metrics.eventsReceived,
              eventsProcessed: metrics.eventsProcessed,
              enrichmentsChanged: metrics.enrichmentsChanged,
              errors: metrics.errors,
              lastProcessedAt: metrics.lastProcessedAt,
            },
          }
        );
      }
    }, 60000); // Every minute
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping Enrichment Service Worker...");

    if (this.scheduler) {
      this.scheduler.stop();
    }

    if (this.cache && this.cache instanceof RedisCache) {
      await this.cache.disconnect();
    }

    if (this.pgPool) {
      await this.pgPool.end();
    }

    console.log("✅ Enrichment Service Worker stopped");
  }
}

// Handle graceful shutdown
const worker = new EnrichmentWorker();

process.on("SIGINT", async () => {
  console.log("\n🔄 Received SIGINT, shutting down gracefully...");
  await worker.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🔄 Received SIGTERM, shutting down gracefully...");
  await worker.stop();
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit - let the worker continue
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Start the worker
worker.start().catch((error) => {
  console.error("❌ Failed to start worker:", error);
  process.exit(1);
});
