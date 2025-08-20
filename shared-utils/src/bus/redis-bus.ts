import Redis from "ioredis";
import {
  BaseEvent,
  BusConfig,
  BusPort,
  EventHandler,
  EventType,
} from "./types";

/**
 * Standardized Redis bus implementation using pub/sub
 *
 * This implementation uses:
 * - ioredis for consistency across services
 * - Simple pub/sub pattern (not streams) for reliability
 * - Proper error handling and reconnection
 * - Graceful shutdown
 */
export class RedisBus implements BusPort {
  private subscriber: Redis;
  private publisher: Redis;
  private handlers = new Map<EventType, EventHandler[]>();
  private isConnected = false;
  private serviceName: string;
  private retryAttempts: number;
  private retryDelayMs: number;

  constructor(config: BusConfig) {
    this.serviceName = config.serviceName;
    this.retryAttempts = config.retryAttempts ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;

    // Create separate connections for pub and sub
    this.subscriber = new Redis(config.redisUrl, {
      enableReadyCheck: false,
      maxRetriesPerRequest: this.retryAttempts,
      lazyConnect: true,
    });

    this.publisher = new Redis(config.redisUrl, {
      enableReadyCheck: false,
      maxRetriesPerRequest: this.retryAttempts,
      lazyConnect: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.subscriber.on("connect", () => {
      console.log(`[${this.serviceName}] Redis subscriber connected`);
      this.isConnected = true;
    });

    this.publisher.on("connect", () => {
      console.log(`[${this.serviceName}] Redis publisher connected`);
    });

    this.subscriber.on("error", (error) => {
      console.error(`[${this.serviceName}] Redis subscriber error:`, error);
      this.isConnected = false;
    });

    this.publisher.on("error", (error) => {
      console.error(`[${this.serviceName}] Redis publisher error:`, error);
    });

    this.subscriber.on("close", () => {
      console.log(`[${this.serviceName}] Redis subscriber connection closed`);
      this.isConnected = false;
    });

    // Set up message handling
    this.subscriber.on("message", this.handleMessage.bind(this));
  }

  async subscribe<T extends BaseEvent>(
    topic: EventType,
    handler: EventHandler<T>
  ): Promise<void> {
    // Add handler to our local registry
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
      // Subscribe to Redis channel for this topic
      await this.subscriber.subscribe(topic);
      console.log(`[${this.serviceName}] Subscribed to topic: ${topic}`);
    }

    this.handlers.get(topic)!.push(handler);
  }

  async publish<T extends BaseEvent>(event: T): Promise<void> {
    try {
      const message = JSON.stringify(event);
      await this.publisher.publish(event.type, message);
      console.log(
        `[${this.serviceName}] Published event: ${event.type} (${event.id})`
      );
    } catch (error) {
      console.error(`[${this.serviceName}] Failed to publish event:`, error);
      throw error;
    }
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      const event = JSON.parse(message) as BaseEvent;
      const handlers = this.handlers.get(channel as EventType) || [];

      console.log(
        `[${this.serviceName}] Received event: ${channel} (${event.id})`
      );

      // Execute all handlers for this channel in parallel
      const promises = handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          console.error(
            `[${this.serviceName}] Handler error for ${channel} (${event.id}):`,
            error
          );
          // Don't throw - let other handlers continue
        }
      });

      await Promise.all(promises);
    } catch (error) {
      console.error(
        `[${this.serviceName}] Failed to handle message on ${channel}:`,
        error
      );
    }
  }

  async close(): Promise<void> {
    console.log(`[${this.serviceName}] Closing Redis bus connections...`);

    try {
      await Promise.all([this.subscriber.quit(), this.publisher.quit()]);
      console.log(`[${this.serviceName}] Redis bus connections closed`);
    } catch (error) {
      console.error(
        `[${this.serviceName}] Error closing Redis connections:`,
        error
      );
    }
  }

  /**
   * Check if the bus is healthy and connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection status for monitoring
   */
  getStatus() {
    return {
      connected: this.isConnected,
      subscriberStatus: this.subscriber.status,
      publisherStatus: this.publisher.status,
      subscribedTopics: Array.from(this.handlers.keys()),
      handlerCount: Array.from(this.handlers.values()).reduce(
        (sum, handlers) => sum + handlers.length,
        0
      ),
    };
  }
}

/**
 * Factory function to create a Redis bus instance
 */
export function createRedisBus(config: BusConfig): RedisBus {
  return new RedisBus(config);
}
