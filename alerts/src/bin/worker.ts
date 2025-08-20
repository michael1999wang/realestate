import { createBus } from "@realestate/shared-utils";
import { Pool } from "pg";
import { BusAdapter } from "../adapters/bus.adapter";
import { sendDevBrowser } from "../adapters/delivery.devbrowser";
import { MockReadAdapter } from "../adapters/read.mock";
import { MemoryAlertsRepo } from "../adapters/repo.memory";
import { PostgresAlertsRepo } from "../adapters/repo.sql";
import { cfg } from "../config/env";
import { MultiChannelDispatcher } from "../core/dispatch";
import { createHandlers } from "../core/handlers";
import { getServiceInfo } from "../core/versioning";

async function main() {
  console.log("Starting Alerts Worker...", getServiceInfo());

  // Initialize adapters
  const sharedBus = createBus({
    type: "redis",
    serviceName: "alerts",
    redisUrl: cfg.redisUrl,
  });
  const bus = new BusAdapter(sharedBus);

  let repo;
  if (cfg.mode === "dev") {
    // Use memory repo with some test data for dev
    repo = new MemoryAlertsRepo([
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
    ]);
  } else {
    const pool = new Pool({
      host: cfg.db.host,
      port: cfg.db.port,
      user: cfg.db.user,
      password: cfg.db.password,
      database: cfg.db.name,
    });
    repo = new PostgresAlertsRepo(pool);
  }

  // Mock read adapter with sample data
  const readAdapter = new MockReadAdapter(
    [
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
  );

  const dispatcher = new MultiChannelDispatcher(sendDevBrowser);

  const handlers = createHandlers({
    bus,
    read: readAdapter,
    repo,
    dispatch: dispatcher,
  });

  // Subscribe to events
  await bus.subscribe("underwrite_completed", handlers.onUnderwriteCompleted);
  await bus.subscribe("property_scored", handlers.onPropertyScored);

  // Start HTTP server in dev mode
  if (cfg.mode === "dev") {
    const { spawn } = require("child_process");
    const httpServer = spawn("ts-node", ["src/http/server.ts"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    process.on("SIGINT", () => {
      httpServer.kill();
      process.exit(0);
    });
  }

  console.log(`Alerts worker running in ${cfg.mode} mode`);
  console.log("Listening for events: underwrite_completed, property_scored");

  // Keep the process alive
  process.on("SIGINT", () => {
    console.log("Shutting down alerts worker...");
    process.exit(0);
  });
}

main().catch(console.error);
