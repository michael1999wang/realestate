/**
 * Shared configuration utilities for microservices
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
}

export interface RedisConfig {
  url: string;
  host?: string;
  port?: number;
}

export interface ServiceConfig {
  mode: string;
  logLevel: string;
  port?: number;
}

/**
 * Create database configuration from environment variables
 */
export function createDatabaseConfig(serviceName: string): DatabaseConfig {
  const defaultPort = getDefaultDbPort(serviceName);

  return {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? defaultPort),
    user: process.env.DB_USER ?? serviceName,
    password: process.env.DB_PASSWORD ?? serviceName,
    name: process.env.DB_NAME ?? `${serviceName}_dev`,
  };
}

/**
 * Create Redis configuration from environment variables
 */
export function createRedisConfig(): RedisConfig {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  // Parse URL for host/port if needed
  try {
    const url = new URL(redisUrl);
    return {
      url: redisUrl,
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 6379,
    };
  } catch {
    // Fallback for non-URL format
    return {
      url: redisUrl,
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
    };
  }
}

/**
 * Create service configuration from environment variables
 */
export function createServiceConfig(defaultPort?: number): ServiceConfig {
  return {
    mode: process.env.MODE ?? process.env.NODE_ENV ?? "development",
    logLevel: process.env.LOG_LEVEL ?? "info",
    port: defaultPort ? Number(process.env.PORT ?? defaultPort) : undefined,
  };
}

/**
 * Get default database port for a service
 */
function getDefaultDbPort(serviceName: string): number {
  const portMap: Record<string, number> = {
    ingestor: 5433,
    enrichment: 5434,
    "rent-estimator": 5435,
    underwriting: 5436,
    alerts: 5437,
  };

  return portMap[serviceName] ?? 5432;
}

/**
 * Validate required environment variables
 */
export function validateRequiredEnv(requiredVars: string[]): void {
  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

/**
 * Parse comma-separated environment variable into array
 */
export function parseEnvArray(
  envVar: string,
  defaultValue: string[] = []
): string[] {
  const value = process.env[envVar];
  if (!value) return defaultValue;

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Parse comma-separated environment variable into number array
 */
export function parseEnvNumberArray(
  envVar: string,
  defaultValue: number[] = []
): number[] {
  const stringArray = parseEnvArray(envVar);
  if (stringArray.length === 0) return defaultValue;

  return stringArray.map((str) => {
    const num = Number(str);
    if (isNaN(num)) {
      throw new Error(`Invalid number in ${envVar}: ${str}`);
    }
    return num;
  });
}
