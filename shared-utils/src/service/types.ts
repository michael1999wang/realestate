import { Pool } from "pg";
import { BusPort } from "../bus/types";
// import { CachePort } from '../cache'; // TODO: Fix cache types

/**
 * Core service configuration interface
 */
export interface BaseServiceConfig<TDeps = any, TEventMap = any> {
  /** Service name for logging and identification */
  name: string;

  /** Service version */
  version: string;

  /** Database configuration */
  database?: ServiceDatabaseConfig;

  /** Cache configuration */
  cache?: ServiceCacheConfig;

  /** External API configurations */
  external?: ExternalAPIConfig[];

  /** Event subscriptions this service listens to */
  subscriptions: EventSubscription<TEventMap>[];

  /** Events this service can publish */
  publications?: EventPublication[];

  /** Factory function to create business logic instance */
  createBusinessLogic: (deps: TDeps) => BusinessLogic<TEventMap>;

  /** Optional factory to create repository instances */
  createRepositories?: (pool: Pool) => RepositoryMap;

  /** Optional factory to create external API client instances */
  createExternalClients?: (config: ExternalAPIConfig[]) => ClientMap;

  /** Optional health check configuration */
  healthCheck?: HealthCheckConfig;

  /** Optional graceful shutdown timeout */
  shutdownTimeoutMs?: number;
}

/**
 * Service database configuration
 */
export interface ServiceDatabaseConfig {
  /** SQL schema file path (optional, for initialization) */
  schema?: string;

  /** Connection pool settings */
  pool?: {
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
}

/**
 * Cache configuration
 */
export interface ServiceCacheConfig {
  type: "redis" | "memory";
  ttlSeconds?: number;
}

/**
 * External API configuration
 */
export interface ExternalAPIConfig {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  mockMode?: boolean;
}

/**
 * Event subscription configuration
 */
export interface EventSubscription<TEventMap> {
  /** The event topic to subscribe to */
  topic: keyof TEventMap;

  /** The handler method name on the business logic class */
  handler: keyof BusinessLogic<TEventMap>;

  /** Consumer group for scaling (optional) */
  consumerGroup?: string;

  /** Subscription options */
  options?: {
    /** Debounce timeout in milliseconds */
    debounce?: number;

    /** Maximum retry attempts */
    retries?: number;

    /** Dead letter queue topic */
    dlqTopic?: string;
  };
}

/**
 * Event publication configuration
 */
export interface EventPublication {
  /** The event topic this service can publish to */
  topic: string;

  /** Optional schema validation */
  schema?: any;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Health check interval in milliseconds */
  intervalMs?: number;

  /** Custom health check functions */
  customChecks?: HealthCheck[];
}

/**
 * Custom health check function
 */
export interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
}

/**
 * Business logic interface
 * Services implement this to define their event handlers
 */
export interface BusinessLogic<TEventMap> {
  /** Event handlers are defined as methods named handle{EventType} */
  [key: string]: (event: any) => Promise<void>;
}

/**
 * Service dependencies injected into business logic
 */
export interface ServiceDependencies {
  bus: BusPort;
  cache?: any; // TODO: Fix cache types
  db?: Pool;
  repositories?: RepositoryMap;
  clients?: ClientMap;
  logger?: Logger;
}

/**
 * Repository map
 */
export interface RepositoryMap {
  [key: string]: any;
}

/**
 * External client map
 */
export interface ClientMap {
  [key: string]: any;
}

/**
 * Service metrics
 */
export interface ServiceMetrics {
  /** Total events received */
  eventsReceived: number;

  /** Total events processed successfully */
  eventsProcessed: number;

  /** Total events failed */
  eventsFailed: number;

  /** Total events published */
  eventsPublished: number;

  /** Service uptime in seconds */
  uptimeSeconds: number;

  /** Memory usage in MB */
  memoryUsageMB: number;

  /** Last processed event timestamp */
  lastProcessedAt?: string;

  /** Last error timestamp */
  lastErrorAt?: string;

  /** Last error message */
  lastError?: string;

  /** Health status */
  isHealthy: boolean;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * Service lifecycle states
 */
export enum ServiceState {
  INITIALIZING = "initializing",
  STARTING = "starting",
  RUNNING = "running",
  STOPPING = "stopping",
  STOPPED = "stopped",
  ERROR = "error",
}

/**
 * Service lifecycle events
 */
export interface ServiceLifecycleEvents {
  "state:changed": { from: ServiceState; to: ServiceState };
  error: { error: Error; context?: string };
  "shutdown:requested": { signal: string };
  "shutdown:complete": { durationMs: number };
}
