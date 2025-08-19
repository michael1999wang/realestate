import { UnderwriteRequestedEvt } from "../core/dto";
import { BusPort } from "../core/ports";

type EventHandler = (event: any) => Promise<void>;

export class MemoryBus implements BusPort {
  private subscribers = new Map<string, EventHandler[]>();
  private publishedEvents: any[] = [];

  async subscribe(
    topic: "listing_changed" | "data_enriched",
    handler: EventHandler
  ): Promise<void> {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, []);
    }
    this.subscribers.get(topic)!.push(handler);
  }

  async publish(evt: UnderwriteRequestedEvt): Promise<void> {
    this.publishedEvents.push(evt);

    // If there are subscribers for this event type, notify them
    const handlers = this.subscribers.get("underwrite_requested" as any) || [];
    for (const handler of handlers) {
      try {
        await handler(evt);
      } catch (error) {
        console.error("Error in event handler:", error);
      }
    }
  }

  // Helper method to simulate incoming events for testing
  async simulateEvent(
    topic: "listing_changed" | "data_enriched",
    event: any
  ): Promise<void> {
    const handlers = this.subscribers.get(topic) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error("Error in event handler:", error);
      }
    }
  }

  // Helper methods for testing
  getPublishedEvents(): any[] {
    return [...this.publishedEvents];
  }

  clearPublishedEvents(): void {
    this.publishedEvents = [];
  }

  getSubscriberCount(topic: string): number {
    return this.subscribers.get(topic)?.length ?? 0;
  }

  clear(): void {
    this.subscribers.clear();
    this.publishedEvents = [];
  }
}
