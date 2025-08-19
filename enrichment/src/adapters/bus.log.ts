import { BusPort } from "../core/ports";

export class LogBus implements BusPort {
  private handlers = new Map<string, ((e: any) => Promise<void>)[]>();

  async subscribe(
    topic: "listing_changed",
    handler: (e: any) => Promise<void>
  ): Promise<void> {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
    }
    this.handlers.get(topic)!.push(handler);
    console.log(`[LogBus] Subscribed to topic: ${topic}`);
  }

  async publish(evt: {
    type: "underwrite_requested";
    id: string;
    assumptionsId?: string;
  }): Promise<void> {
    console.log(`[LogBus] Publishing event:`, JSON.stringify(evt, null, 2));
  }

  // Test helper to simulate incoming events
  async simulateEvent(topic: string, event: any): Promise<void> {
    const handlers = this.handlers.get(topic) || [];
    console.log(
      `[LogBus] Simulating event on topic ${topic}:`,
      JSON.stringify(event, null, 2)
    );

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[LogBus] Handler error for topic ${topic}:`, error);
      }
    }
  }

  // Test helpers
  getHandlerCount(topic: string): number {
    return this.handlers.get(topic)?.length ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
