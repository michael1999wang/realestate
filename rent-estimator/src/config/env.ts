import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const dbCfg = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5435),
  user: process.env.DB_USER ?? "rent",
  password: process.env.DB_PASSWORD ?? "rent",
  name: process.env.DB_NAME ?? "rent_dev"
};

export const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const config = {
  db: dbCfg,
  redis: redisUrl,
  estimator: {
    version: "1.0.0",
    materialChangeThreshold: Number(process.env.MATERIAL_CHANGE_THRESHOLD ?? 0.03), // 3%
    debounceTtlSec: Number(process.env.DEBOUNCE_TTL_SEC ?? 60), // 60 seconds
    cacheTtlSec: Number(process.env.CACHE_TTL_SEC ?? 86400), // 24 hours
    comps: {
      radiusKm: Number(process.env.COMPS_RADIUS_KM ?? 2.0),
      daysBack: Number(process.env.COMPS_DAYS_BACK ?? 120),
      maxComps: Number(process.env.COMPS_MAX ?? 15)
    }
  }
};
