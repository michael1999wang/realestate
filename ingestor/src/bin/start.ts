#!/usr/bin/env node

import { createBus } from "@realestate/shared-utils";
import { BusAdapter } from "../adapters/bus.adapter";
import {
  busCfg,
  cfg,
  dbCfg,
  redisCfg,
  sourceCfg,
  validateConfig,
} from "../config/env";
import { runOnce } from "../core/poller";
import { sleep } from "../core/utils";

// Import adapters
import { LogBus } from "../adapters/bus.log";
import { SQSBus } from "../adapters/bus.sqs";
import { MemoryRepo } from "../adapters/repo.memory";
import { SqlRepo } from "../adapters/repo.sql";
import { DDFSource } from "../adapters/source.ddf";
import { MockSource } from "../adapters/source.mock";
import { SeleniumSource } from "../adapters/source.selenium";

import type { BusPort, RepoPort, SourcePort } from "../core/ports";

function createSourceAdapter(): SourcePort {
  switch (cfg.adapter) {
    case "MOCK":
      return new MockSource(cfg.pageSize);

    case "SELENIUM":
      return new SeleniumSource({
        baseUrl: sourceCfg.selenium.baseUrl,
        loginCredentials: sourceCfg.selenium.username
          ? {
              username: sourceCfg.selenium.username,
              password: sourceCfg.selenium.password,
            }
          : undefined,
        pageSize: cfg.pageSize,
      });

    case "DDF":
      return new DDFSource({
        baseUrl: sourceCfg.ddf.baseUrl,
        username: sourceCfg.ddf.username,
        password: sourceCfg.ddf.password,
        loginUrl: sourceCfg.ddf.loginUrl,
        pageSize: cfg.pageSize,
      });

    default:
      throw new Error(`Unknown source adapter: ${cfg.adapter}`);
  }
}

function createRepoAdapter(): RepoPort {
  switch (cfg.adapter) {
    case "SQL":
      return new SqlRepo({
        host: dbCfg.host,
        port: dbCfg.port,
        user: dbCfg.user,
        password: dbCfg.password,
        database: dbCfg.name,
      });

    default:
      // Default to memory for all other adapters (MOCK, SELENIUM, DDF)
      return new MemoryRepo();
  }
}

function createBusAdapter(): BusPort {
  switch (busCfg.adapter) {
    case "REDIS":
      const sharedBus = createBus({
        type: "redis",
        serviceName: "ingestor",
        redisUrl: redisCfg.url,
      });
      return new BusAdapter(sharedBus);

    case "SQS":
      return new SQSBus(busCfg.sqs);

    case "LOG":
    default:
      return new LogBus();
  }
}

async function main() {
  console.log(
    `[INGESTOR] Starting in ${cfg.mode} mode with ${cfg.adapter} adapter`
  );
  console.log(`[INGESTOR] Poll interval: ${cfg.pollIntervalMs}ms`);

  try {
    // Validate configuration
    validateConfig();

    // Create adapters
    const source = createSourceAdapter();
    const repo = createRepoAdapter();
    const bus = createBusAdapter();

    console.log("[INGESTOR] Adapters initialized successfully");

    // Handle graceful shutdown
    let running = true;
    const shutdown = () => {
      console.log("[INGESTOR] Received shutdown signal, stopping...");
      running = false;
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Main polling loop
    let consecutiveErrors = 0;
    const maxErrors = cfg.maxRetries;

    while (running) {
      try {
        console.log(`[INGESTOR] Starting poll cycle...`);

        const result = await runOnce(source, repo, bus, "TRREB");

        console.log(`[INGESTOR] Poll cycle completed:`, {
          processed: result.processed,
          changed: result.changed,
          pages: result.pages,
          duration: `${result.durationMs}ms`,
        });

        // Reset error counter on successful poll
        consecutiveErrors = 0;

        // Wait for next poll interval
        if (running) {
          console.log(
            `[INGESTOR] Waiting ${cfg.pollIntervalMs}ms until next poll...`
          );
          await sleep(cfg.pollIntervalMs);
        }
      } catch (error) {
        consecutiveErrors++;
        console.error(
          `[INGESTOR] Poll cycle failed (${consecutiveErrors}/${maxErrors}):`,
          error
        );

        if (consecutiveErrors >= maxErrors) {
          console.error(
            `[INGESTOR] Max consecutive errors reached (${maxErrors}), shutting down`
          );
          break;
        }

        // Exponential backoff on errors
        const backoffTime = cfg.backoffMs * Math.pow(2, consecutiveErrors - 1);
        console.log(
          `[INGESTOR] Backing off for ${backoffTime}ms before retry...`
        );
        await sleep(backoffTime);
      }
    }

    console.log("[INGESTOR] Shutdown complete");
  } catch (error) {
    console.error("[INGESTOR] Fatal error during startup:", error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("[INGESTOR] Unhandled error:", error);
    process.exit(1);
  });
}
