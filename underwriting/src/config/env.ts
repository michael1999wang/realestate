export const dbCfg = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5436),
  user: process.env.DB_USER ?? "uw",
  password: process.env.DB_PASSWORD ?? "uw",
  name: process.env.DB_NAME ?? "uw_dev",
};

export const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const gridCfg = {
  downMin: Number(process.env.GRID_DOWN_MIN ?? 0.05),
  downMax: Number(process.env.GRID_DOWN_MAX ?? 0.35),
  downStep: Number(process.env.GRID_DOWN_STEP ?? 0.01),
  rateMin: Number(process.env.GRID_RATE_MIN_BPS ?? 300),
  rateMax: Number(process.env.GRID_RATE_MAX_BPS ?? 800),
  rateStep: Number(process.env.GRID_RATE_STEP_BPS ?? 5),
  amorts: (process.env.GRID_AMORTS ?? "240,300,360").split(",").map(Number),
};

export const logLevel = process.env.LOG_LEVEL ?? "info";
export const nodeEnv = process.env.NODE_ENV ?? "development";
