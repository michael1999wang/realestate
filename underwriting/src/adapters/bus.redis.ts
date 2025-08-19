import Redis from "ioredis";
import { UnderwriteCompletedEvt } from "../core/dto";
import { BusPort } from "../core/ports";

type EventHandler = (evt: any) => Promise<void>;
type EventType = "underwrite_requested" | "listing_changed";

/**
 * Redis-based implementation of bus port using pub/sub
 */
export class RedisBusPort implements BusPort {
  private subscriber: Redis;
  private publisher: Redis;
  private handlers = new Map<EventType, EventHandler[]>();

  constructor(redisUrl: string) {
    this.subscriber = new Redis(redisUrl);
    this.publisher = new Redis(redisUrl);

    // Set up message handling
    this.subscriber.on("message", this.handleMessage.bind(this));
  }

  async subscribe(topic: EventType, handler: EventHandler): Promise<void> {
    // Add handler to our local registry
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
      // Subscribe to Redis channel for this topic
      await this.subscriber.subscribe(topic);
    }

    this.handlers.get(topic)!.push(handler);
  }

  async publish(evt: UnderwriteCompletedEvt): Promise<void> {
    const message = JSON.stringify(evt);
    await this.publisher.publish(evt.type, message);
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      const evt = JSON.parse(message);
      const handlers = this.handlers.get(channel as EventType) || [];

      // Execute all handlers for this channel
      const promises = handlers.map(async (handler) => {
        try {
          await handler(evt);
        } catch (error) {
          console.error(`Handler error for ${channel}:`, error);
        }
      });

      await Promise.all(promises);
    } catch (error) {
      console.error(`Failed to handle message on ${channel}:`, error);
    }
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}

/**
 * Factory function to create Redis bus port
 */
export function createRedisBusPort(redisUrl: string): RedisBusPort {
  return new RedisBusPort(redisUrl);
}
