// Export types
export type {
  BaseEvent,
  BusConfig,
  BusPort,
  EventHandler,
  EventType,
} from "./types";

// Export implementations
export { createMemoryBus, MemoryBus } from "./memory-bus";
export { createRedisBus, RedisBus } from "./redis-bus";

// Export factory function for easy bus creation
import { createMemoryBus } from "./memory-bus";
import { createRedisBus } from "./redis-bus";
import { BusConfig } from "./types";

export interface BusFactoryConfig extends Partial<BusConfig> {
  type: "redis" | "memory";
  serviceName: string;
  redisUrl?: string;
}

/**
 * Factory function to create the appropriate bus based on configuration
 */
export function createBus(config: BusFactoryConfig) {
  switch (config.type) {
    case "redis":
      if (!config.redisUrl) {
        throw new Error("Redis URL is required for Redis bus");
      }
      return createRedisBus({
        redisUrl: config.redisUrl,
        serviceName: config.serviceName,
        retryAttempts: config.retryAttempts,
        retryDelayMs: config.retryDelayMs,
        healthCheckIntervalMs: config.healthCheckIntervalMs,
      });

    case "memory":
      return createMemoryBus(config.serviceName);

    default:
      throw new Error(`Unknown bus type: ${config.type}`);
  }
}
