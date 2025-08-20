/**
 * Environment configuration for ingestor service
 */

export interface AppConfig {
  mode: "dev" | "prod";
  pollIntervalSec: number;
  batchSize: number;
}

export interface SourceConfig {
  type: "mock" | "ddf" | "selenium";
  mockFixturesPath: string;
  ddfConfig: Record<string, unknown>;
  seleniumConfig: Record<string, unknown>;
}

export const appCfg: AppConfig = {
  mode: (process.env.NODE_ENV === "production" ? "prod" : "dev") as "dev" | "prod",
  pollIntervalSec: parseInt(process.env.POLL_INTERVAL_SEC || "300", 10), // 5 minutes
  batchSize: parseInt(process.env.BATCH_SIZE || "100", 10),
};

export const sourceCfg: SourceConfig = {
  type: (process.env.SOURCE_TYPE || "mock") as "mock" | "ddf" | "selenium",
  mockFixturesPath: process.env.MOCK_FIXTURES_PATH || "fixtures/treb_listings.json",
  ddfConfig: {},
  seleniumConfig: {},
};
