export const dbCfg = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5434),
  user: process.env.DB_USER ?? "enrichment",
  password: process.env.DB_PASSWORD ?? "enrichment",
  name: process.env.DB_NAME ?? "enrichment_dev",
};

export const cacheCfg = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6380),
};

export const apiCfg = {
  walkscoreKey: process.env.WALKSCORE_KEY,
  geocodeProvider: process.env.GEOCODE_PROVIDER ?? "mock",
  geocodeKey: process.env.GEOCODE_KEY,
  cmhcMode: process.env.CMHC_MODE ?? "mock",
};

export const redisCfg = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
};

export const busCfg = {
  adapter: process.env.BUS_ADAPTER ?? "REDIS", // REDIS or LOG
};

export const appCfg = {
  mode: process.env.MODE ?? "dev",
  logLevel: process.env.LOG_LEVEL ?? "info",
  debounceTimeoutSec: Number(process.env.DEBOUNCE_TIMEOUT_SEC ?? 30),
};
