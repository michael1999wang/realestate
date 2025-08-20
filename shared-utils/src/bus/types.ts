/**
 * Standard event types used across the realestate platform
 */
export type EventType =
  | "listing_changed"
  | "data_enriched"
  | "underwrite_requested"
  | "underwrite_completed"
  | "property_scored"
  | "alert_fired";

/**
 * Base event interface that all events must implement
 */
export interface BaseEvent {
  type: EventType;
  id: string;
  timestamp: string;
  version?: string;
}

/**
 * Event handler function type
 */
export type EventHandler<T = any> = (event: T) => Promise<void>;

/**
 * Standard bus port interface
 */
export interface BusPort {
  /**
   * Subscribe to events of a specific type
   */
  subscribe<T extends BaseEvent>(
    topic: EventType,
    handler: EventHandler<T>
  ): Promise<void>;

  /**
   * Publish an event to a topic
   */
  publish<T extends BaseEvent>(event: T): Promise<void>;

  /**
   * Close the bus connection and cleanup resources
   */
  close?(): Promise<void>;
}

/**
 * Bus configuration options
 */
export interface BusConfig {
  redisUrl: string;
  serviceName: string;
  retryAttempts?: number;
  retryDelayMs?: number;
  healthCheckIntervalMs?: number;
}
