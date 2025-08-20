import { BaseEvent, BusPort, EventHandler, EventType } from "./types";

/**
 * In-memory bus implementation for testing and development
 *
 * This implementation:
 * - Keeps all events in memory
 * - Executes handlers synchronously
 * - Useful for testing and local development
 * - No external dependencies
 */
export class MemoryBus implements BusPort {
  private handlers = new Map<EventType, EventHandler[]>();
  private publishedEvents: BaseEvent[] = [];
  private serviceName: string;

  constructor(serviceName: string = "memory-bus") {
    this.serviceName = serviceName;
  }

  async subscribe<T extends BaseEvent>(
    topic: EventType,
    handler: EventHandler<T>
  ): Promise<void> {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
      console.log(`[${this.serviceName}] Subscribed to topic: ${topic}`);
    }

    this.handlers.get(topic)!.push(handler as EventHandler);
  }

  async publish<T extends BaseEvent>(event: T): Promise<void> {
    console.log(
      `[${this.serviceName}] Publishing event: ${event.type} (${event.id})`
    );

    // Store the event for debugging/testing
    this.publishedEvents.push(event);

    // Get handlers for this event type
    const handlers = this.handlers.get(event.type) || [];

    // Execute all handlers
    const promises = handlers.map(async (handler) => {
      try {
        await handler(event);
      } catch (error) {
        console.error(
          `[${this.serviceName}] Handler error for ${event.type} (${event.id}):`,
          error
        );
        // Don't throw - let other handlers continue
      }
    });

    await Promise.all(promises);
  }

  async close(): Promise<void> {
    console.log(`[${this.serviceName}] Closing memory bus (clearing handlers)`);
    this.handlers.clear();
    this.publishedEvents = [];
  }

  /**
   * Get all published events (useful for testing)
   */
  getPublishedEvents(): BaseEvent[] {
    return [...this.publishedEvents];
  }

  /**
   * Clear published events history
   */
  clearHistory(): void {
    this.publishedEvents = [];
  }

  /**
   * Get current subscription info
   */
  getStatus() {
    return {
      subscribedTopics: Array.from(this.handlers.keys()),
      handlerCount: Array.from(this.handlers.values()).reduce(
        (sum, handlers) => sum + handlers.length,
        0
      ),
      publishedEventCount: this.publishedEvents.length,
    };
  }
}

/**
 * Factory function to create a memory bus instance
 */
export function createMemoryBus(serviceName?: string): MemoryBus {
  return new MemoryBus(serviceName);
}
