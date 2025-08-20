import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export const cfg = {
  mode: process.env.MODE ?? "dev",
  adapter: process.env.ADAPTER ?? "MOCK", // MOCK|SELENIUM|DDF|SQL
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 300000), // 5 minutes default
  pageSize: Number(process.env.PAGE_SIZE ?? 25),
  maxRetries: Number(process.env.MAX_RETRIES ?? 3),
  backoffMs: Number(process.env.BACKOFF_MS ?? 5000),
};

export const dbCfg = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5433),
  user: process.env.DB_USER ?? "ingestor",
  password: process.env.DB_PASSWORD ?? "ingestor",
  name: process.env.DB_NAME ?? "ingestor_dev",
};

export const sourceCfg = {
  // DDF configuration
  ddf: {
    baseUrl: process.env.DDF_BASE_URL ?? "",
    username: process.env.DDF_USERNAME ?? "",
    password: process.env.DDF_PASSWORD ?? "",
    loginUrl: process.env.DDF_LOGIN_URL ?? "",
  },

  // Selenium configuration
  selenium: {
    baseUrl: process.env.SELENIUM_BASE_URL ?? "",
    username: process.env.SELENIUM_USERNAME ?? "",
    password: process.env.SELENIUM_PASSWORD ?? "",
    headless: process.env.SELENIUM_HEADLESS !== "false",
  },
};

export const redisCfg = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
};

export const busCfg = {
  adapter: process.env.BUS_ADAPTER ?? "REDIS", // REDIS, SQS, or LOG
  // SQS configuration
  sqs: {
    queueUrl: process.env.SQS_QUEUE_URL ?? "",
    region: process.env.AWS_REGION ?? "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// Validation
export function validateConfig(): void {
  if (cfg.adapter === "SQL" && !dbCfg.host) {
    throw new Error("DB_HOST is required when using SQL adapter");
  }

  if (
    cfg.adapter === "DDF" &&
    (!sourceCfg.ddf.baseUrl || !sourceCfg.ddf.username)
  ) {
    throw new Error(
      "DDF_BASE_URL and DDF_USERNAME are required when using DDF adapter"
    );
  }

  if (cfg.adapter === "SELENIUM" && !sourceCfg.selenium.baseUrl) {
    throw new Error(
      "SELENIUM_BASE_URL is required when using SELENIUM adapter"
    );
  }

  if (cfg.pollIntervalMs < 10000) {
    console.warn(
      "Warning: Poll interval is less than 10 seconds, this may be too aggressive"
    );
  }
}
