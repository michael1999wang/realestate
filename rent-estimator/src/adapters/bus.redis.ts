import { createClient, RedisClientType } from "redis";
import {
  DataEnrichedEvt,
  ListingChangedEvt,
  UnderwriteRequestedEvt,
} from "../core/dto";
import { BusPort } from "../core/ports";

export class RedisBus implements BusPort {
  private client: RedisClientType;
  private subscriber: RedisClientType;
  private connected = false;
  private subscriberConnected = false;
  private handlers = new Map<string, ((event: any) => Promise<void>)[]>();

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
    this.subscriber = createClient({ url: redisUrl });

    this.client.on("error", (err) => {
      console.error("Redis Bus Client Error:", err);
      this.connected = false;
    });

    this.subscriber.on("error", (err) => {
      console.error("Redis Bus Subscriber Error:", err);
      this.subscriberConnected = false;
    });

    this.client.on("connect", () => {
      console.log("Redis Bus Client Connected");
      this.connected = true;
    });

    this.subscriber.on("connect", () => {
      console.log("Redis Bus Subscriber Connected");
      this.subscriberConnected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
    }
    if (!this.subscriberConnected) {
      await this.subscriber.connect();
    }
  }

  async subscribe(
    topic: "listing_changed" | "data_enriched",
    handler: (event: ListingChangedEvt | DataEnrichedEvt) => Promise<void>
  ): Promise<void> {
    await this.connect();

    // Store handler for this topic
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
    }
    this.handlers.get(topic)!.push(handler);

    // Subscribe to Redis channel
    await this.subscriber.subscribe(topic, async (message) => {
      try {
        const event = JSON.parse(message);
        console.log(`Received ${topic} event:`, event);

        // Call all handlers for this topic
        const topicHandlers = this.handlers.get(topic) || [];
        await Promise.all(topicHandlers.map((h) => h(event)));
      } catch (error) {
        console.error(`Error processing ${topic} event:`, error);
      }
    });

    console.log(`Subscribed to ${topic}`);
  }

  async publish(evt: UnderwriteRequestedEvt): Promise<void> {
    try {
      await this.connect();

      const message = JSON.stringify(evt);
      const channel = "underwrite_requested";

      await this.client.publish(channel, message);
      console.log(`Published event to ${channel}:`, evt);
    } catch (error) {
      console.error("Error publishing event:", error);
      throw error;
    }
  }

  // Alternative method for publishing any event type
  async publishEvent(channel: string, event: any): Promise<void> {
    try {
      await this.connect();

      const message = JSON.stringify(event);
      await this.client.publish(channel, message);
      console.log(`Published event to ${channel}:`, event);
    } catch (error) {
      console.error(`Error publishing event to ${channel}:`, error);
      throw error;
    }
  }

  // Stream-based alternative (more robust for production)
  async publishToStream(streamName: string, event: any): Promise<void> {
    try {
      await this.connect();

      const fields = Object.entries(event).flat().map(String);
      await this.client.xAdd(streamName, "*", fields);
      console.log(`Added event to stream ${streamName}:`, event);
    } catch (error) {
      console.error(`Error adding event to stream ${streamName}:`, error);
      throw error;
    }
  }

  async subscribeToStream(
    streamName: string,
    consumerGroup: string,
    consumerName: string,
    handler: (event: any) => Promise<void>
  ): Promise<void> {
    try {
      await this.connect();

      // Create consumer group if it doesn't exist
      try {
        await this.client.xGroupCreate(streamName, consumerGroup, "0", {
          MKSTREAM: true,
        });
      } catch (error: any) {
        if (!error.message.includes("BUSYGROUP")) {
          throw error;
        }
      }

      // Start consuming messages
      const processMessages = async () => {
        while (true) {
          try {
            const messages = await this.client.xReadGroup(
              consumerGroup,
              consumerName,
              [{ key: streamName, id: ">" }],
              { COUNT: 10, BLOCK: 1000 }
            );

            if (messages) {
              for (const stream of messages) {
                for (const message of stream.messages) {
                  try {
                    // Convert Redis stream message to object
                    const event: any = {};
                    for (let i = 0; i < message.message.length; i += 2) {
                      const key = message.message[i];
                      const value = message.message[i + 1];
                      try {
                        event[key] = JSON.parse(value);
                      } catch {
                        event[key] = value;
                      }
                    }

                    await handler(event);

                    // Acknowledge message
                    await this.client.xAck(
                      streamName,
                      consumerGroup,
                      message.id
                    );
                  } catch (error) {
                    console.error(
                      `Error processing stream message ${message.id}:`,
                      error
                    );
                  }
                }
              }
            }
          } catch (error) {
            console.error("Error reading from stream:", error);
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before retry
          }
        }
      };

      // Start processing in background
      processMessages().catch((error) => {
        console.error("Stream processing stopped:", error);
      });

      console.log(
        `Subscribed to stream ${streamName} with consumer group ${consumerGroup}`
      );
    } catch (error) {
      console.error(`Error subscribing to stream ${streamName}:`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.subscriberConnected) {
        await this.subscriber.disconnect();
        this.subscriberConnected = false;
      }
      if (this.connected) {
        await this.client.disconnect();
        this.connected = false;
      }
    } catch (error) {
      console.error("Error closing Redis bus connections:", error);
    }
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Redis bus health check failed:", error);
      return false;
    }
  }
}
