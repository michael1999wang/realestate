import Redis from "ioredis";
import { BusPort } from "../core/ports";

export class RedisBus implements BusPort {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async subscribe(
    topic: "underwrite_completed" | "property_scored",
    handler: (evt: any) => Promise<void>
  ): Promise<void> {
    const streamKey = `events:${topic}`;

    // Create consumer group if it doesn't exist
    try {
      await this.redis.xgroup("CREATE", streamKey, "alerts", "$", "MKSTREAM");
    } catch (error) {
      // Group might already exist, ignore error
    }

    // Start consuming
    this.consumeStream(streamKey, handler);
  }

  private async consumeStream(
    streamKey: string,
    handler: (evt: any) => Promise<void>
  ) {
    const consumerName = `alerts-${Math.random().toString(36).slice(2)}`;

    while (true) {
      try {
        const results = await this.redis.xreadgroup(
          "GROUP",
          "alerts",
          consumerName,
          "COUNT",
          1,
          "BLOCK",
          1000,
          "STREAMS",
          streamKey,
          ">"
        );

        if (results && results.length > 0) {
          const [, messages] = results[0] as [string, [string, string[]][]];
          for (const [messageId, fields] of messages) {
            try {
              // Parse the event from Redis stream fields
              const evt = this.parseStreamMessage(fields);
              await handler(evt);

              // Acknowledge the message
              await this.redis.xack(streamKey, "alerts", messageId);
            } catch (error) {
              console.error(`Error processing message ${messageId}:`, error);
              // In production, you might want to move to a dead letter queue
            }
          }
        }
      } catch (error) {
        console.error("Error reading from stream:", error);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before retrying
      }
    }
  }

  private parseStreamMessage(fields: string[]): any {
    const obj: any = {};
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];

      // Try to parse JSON values
      try {
        obj[key] = JSON.parse(value);
      } catch {
        obj[key] = value;
      }
    }
    return obj;
  }
}
