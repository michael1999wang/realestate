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
export type EventHandler<T extends BaseEvent = BaseEvent> = (
  event: T
) => Promise<void>;

/**
 * Specific event interfaces
 */
export interface ListingChangedEvent extends BaseEvent {
  type: "listing_changed";
  data: {
    id: string;
    updatedAt: string;
    change: "create" | "update" | "status_change";
    dirty?: ("price" | "status" | "fees" | "tax" | "media" | "address")[];
  };
}

export interface DataEnrichedEvent extends BaseEvent {
  type: "data_enriched";
  data: {
    id: string;
    enrichmentTypes: string[];
    updatedAt: string;
  };
}

export interface UnderwriteRequestedEvent extends BaseEvent {
  type: "underwrite_requested";
  data: {
    id: string;
    assumptionsId?: string;
  };
}

export interface UnderwriteCompletedEvent extends BaseEvent {
  type: "underwrite_completed";
  data: {
    id: string;
    resultId: string;
    source: "grid" | "exact";
    score?: number;
  };
}

export interface PropertyScoredEvent extends BaseEvent {
  type: "property_scored";
  data: {
    id: string;
    score: number;
    userId?: string;
  };
}

export interface AlertsFiredEvent extends BaseEvent {
  type: "alert_fired";
  data: {
    userId: string;
    listingId: string;
    resultId: string;
  };
}

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
