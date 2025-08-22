/**
 * Environment Configuration for API Gateway
 */

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

interface ServiceEndpoint {
  name: string;
  baseUrl: string;
  timeout: number;
}

interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
}

interface RateLimitConfig {
  windowMs: number;
  free: { requests: number };
  pro: { requests: number };
  enterprise: { requests: number };
}

// Database Configuration
export const dbCfg: DatabaseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
  database: process.env.DB_NAME || "api_gateway",
};

// Redis Configuration
export const redisCfg: RedisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || "0"),
};

// Upstream Service Endpoints
export const serviceCfg: Record<string, ServiceEndpoint> = {
  ingestor: {
    name: "ingestor",
    baseUrl: process.env.INGESTOR_URL || "http://localhost:3001",
    timeout: parseInt(process.env.INGESTOR_TIMEOUT || "5000"),
  },
  enrichment: {
    name: "enrichment",
    baseUrl: process.env.ENRICHMENT_URL || "http://localhost:3002",
    timeout: parseInt(process.env.ENRICHMENT_TIMEOUT || "5000"),
  },
  rentEstimator: {
    name: "rent-estimator",
    baseUrl: process.env.RENT_ESTIMATOR_URL || "http://localhost:3003",
    timeout: parseInt(process.env.RENT_ESTIMATOR_TIMEOUT || "5000"),
  },
  underwriting: {
    name: "underwriting",
    baseUrl: process.env.UNDERWRITING_URL || "http://localhost:3004",
    timeout: parseInt(process.env.UNDERWRITING_TIMEOUT || "10000"), // Longer for complex calculations
  },
  alerts: {
    name: "alerts",
    baseUrl: process.env.ALERTS_URL || "http://localhost:3005",
    timeout: parseInt(process.env.ALERTS_TIMEOUT || "5000"),
  },
};

// Authentication Configuration
export const authCfg: AuthConfig = {
  jwtSecret:
    process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12"),
};

// Rate Limiting Configuration
export const rateLimitCfg: RateLimitConfig = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "3600000"), // 1 hour
  free: {
    requests: parseInt(process.env.RATE_LIMIT_FREE || "100"),
  },
  pro: {
    requests: parseInt(process.env.RATE_LIMIT_PRO || "1000"),
  },
  enterprise: {
    requests: parseInt(process.env.RATE_LIMIT_ENTERPRISE || "10000"),
  },
};

// API Gateway Configuration
export const apiCfg = {
  port: parseInt(process.env.PORT || "8080"),
  isDevelopment: process.env.NODE_ENV === "development",
  corsOrigins: process.env.CORS_ORIGINS?.split(",") || [
    "http://localhost:3000",
  ],
  apiVersion: process.env.API_VERSION || "v1",

  // Feature flags
  enableAuth: process.env.ENABLE_AUTH !== "false", // Default to enabled
  enableRateLimit: process.env.ENABLE_RATE_LIMIT !== "false",
  enableCache: process.env.ENABLE_CACHE !== "false",

  // Cache TTL settings (in seconds)
  cacheTTL: {
    listings: parseInt(process.env.CACHE_TTL_LISTINGS || "300"), // 5 minutes
    enrichments: parseInt(process.env.CACHE_TTL_ENRICHMENTS || "3600"), // 1 hour
    underwriting: parseInt(process.env.CACHE_TTL_UNDERWRITING || "1800"), // 30 minutes
    health: parseInt(process.env.CACHE_TTL_HEALTH || "60"), // 1 minute
  },
};
