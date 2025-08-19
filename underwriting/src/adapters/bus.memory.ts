import {
  ListingChangedEvt,
  UnderwriteCompletedEvt,
  UnderwriteRequestedEvt,
} from "../core/dto";
import { BusPort } from "../core/ports";

type EventHandler = (evt: any) => Promise<void>;
type EventType = "underwrite_requested" | "listing_changed";

/**
 * In-memory implementation of bus port for testing
 */
export class MemoryBusPort implements BusPort {
  private handlers = new Map<EventType, EventHandler[]>();
  private publishedEvents: Array<{
    type: string;
    event: any;
    timestamp: Date;
  }> = [];

  async subscribe(topic: EventType, handler: EventHandler): Promise<void> {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
    }
    this.handlers.get(topic)!.push(handler);
  }

  async publish(evt: UnderwriteCompletedEvt): Promise<void> {
    this.publishedEvents.push({
      type: evt.type,
      event: evt,
      timestamp: new Date(),
    });

    // For testing, we don't actually dispatch to handlers
    // In a real implementation, you might want to dispatch synchronously for testing
  }

  // Test helper methods
  async simulateEvent(
    topic: EventType,
    evt: UnderwriteRequestedEvt | ListingChangedEvt
  ): Promise<void> {
    const handlers = this.handlers.get(topic) || [];

    // Execute all handlers for this topic
    const promises = handlers.map((handler) => handler(evt));
    await Promise.all(promises);
  }

  getPublishedEvents(): Array<{ type: string; event: any; timestamp: Date }> {
    return [...this.publishedEvents];
  }

  getHandlerCount(topic: EventType): number {
    return this.handlers.get(topic)?.length || 0;
  }

  clear(): void {
    this.handlers.clear();
    this.publishedEvents = [];
  }
}
