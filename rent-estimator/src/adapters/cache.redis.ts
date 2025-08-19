import { createClient, RedisClientType } from "redis";
import { CachePort } from "../core/ports";

export class RedisCache implements CachePort {
  private client: RedisClientType;
  private connected = false;

  constructor(redisUrl: string) {
    this.client = createClient({
      url: redisUrl,
    });

    this.client.on("error", (err) => {
      console.error("Redis Client Error:", err);
      this.connected = false;
    });

    this.client.on("connect", () => {
      console.log("Redis Client Connected");
      this.connected = true;
    });

    this.client.on("disconnect", () => {
      console.log("Redis Client Disconnected");
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      await this.connect();
      const value = await this.client.get(key);

      if (value === null) {
        return null;
      }

      try {
        return JSON.parse(value) as T;
      } catch {
        // If JSON parsing fails, return as string
        return value as T;
      }
    } catch (error) {
      console.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, val: any, ttlSec: number): Promise<void> {
    try {
      await this.connect();

      const value = typeof val === "string" ? val : JSON.stringify(val);

      if (ttlSec > 0) {
        await this.client.setEx(key, ttlSec, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      console.error(`Redis set error for key ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error(`Redis delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      console.error(`Redis exists error for key ${key}:`, error);
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Redis health check failed:", error);
      return false;
    }
  }

  // Utility methods
  async clear(): Promise<void> {
    try {
      await this.connect();
      await this.client.flushDb();
    } catch (error) {
      console.error("Redis clear error:", error);
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      await this.connect();
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`Redis keys error for pattern ${pattern}:`, error);
      return [];
    }
  }
}
