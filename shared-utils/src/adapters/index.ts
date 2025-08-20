/**
 * Shared adapter utilities for microservices
 */

import { BaseEvent, BusPort as SharedBusPort } from "../bus";

/**
 * Base bus adapter class that handles common event conversion logic
 */
export abstract class BaseBusAdapter {
  constructor(protected sharedBus: SharedBusPort) {}

  /**
   * Convert a local event to shared bus event format
   */
  protected toSharedEvent<T extends Partial<BaseEvent>>(
    localEvent: T,
    version: string = "1.0.0"
  ): BaseEvent {
    return {
      ...localEvent,
      timestamp: localEvent.timestamp || new Date().toISOString(),
      version: localEvent.version || version,
    } as BaseEvent;
  }

  /**
   * Subscribe to events with type-safe wrapper
   */
  protected async subscribeWithWrapper<T extends BaseEvent>(
    topic: T["type"],
    handler: (event: any) => Promise<void>
  ): Promise<void> {
    return this.sharedBus.subscribe(topic, async (event: BaseEvent) => {
      await handler(event);
    });
  }

  /**
   * Publish an event with automatic conversion
   */
  protected async publishEvent<T extends Partial<BaseEvent>>(
    event: T,
    version?: string
  ): Promise<void> {
    const sharedEvent = this.toSharedEvent(event, version);
    return this.sharedBus.publish(sharedEvent);
  }

  /**
   * Close the underlying bus connection
   */
  async close(): Promise<void> {
    if (this.sharedBus.close) {
      return this.sharedBus.close();
    }
  }
}

/**
 * Generic bus adapter for services that only publish events
 */
export class PublisherBusAdapter extends BaseBusAdapter {
  async publish<T extends Partial<BaseEvent>>(
    event: T,
    version?: string
  ): Promise<void> {
    return this.publishEvent(event, version);
  }
}

/**
 * Generic bus adapter for services that only subscribe to events
 */
export class SubscriberBusAdapter extends BaseBusAdapter {
  async subscribe<T extends BaseEvent>(
    topic: T["type"],
    handler: (event: T) => Promise<void>
  ): Promise<void> {
    return this.subscribeWithWrapper(topic, handler);
  }
}

/**
 * Generic bus adapter for services that both publish and subscribe
 */
export class FullBusAdapter extends BaseBusAdapter {
  async publish<T extends Partial<BaseEvent>>(
    event: T,
    version?: string
  ): Promise<void> {
    return this.publishEvent(event, version);
  }

  async subscribe<T extends BaseEvent>(
    topic: T["type"],
    handler: (event: T) => Promise<void>
  ): Promise<void> {
    return this.subscribeWithWrapper(topic, handler);
  }
}

/**
 * Factory function to create appropriate bus adapter
 */
export function createBusAdapter(
  type: "publisher" | "subscriber" | "full",
  sharedBus: SharedBusPort
) {
  switch (type) {
    case "publisher":
      return new PublisherBusAdapter(sharedBus);
    case "subscriber":
      return new SubscriberBusAdapter(sharedBus);
    case "full":
      return new FullBusAdapter(sharedBus);
    default:
      throw new Error(`Unknown bus adapter type: ${type}`);
  }
}
