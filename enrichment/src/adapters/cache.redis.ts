import { createClient, RedisClientType } from "redis";
import { CachePort } from "../core/ports";

export class RedisCache implements CachePort {
  private client: RedisClientType;
  private connected: boolean = false;

  constructor(options: { host: string; port: number }) {
    this.client = createClient({
      socket: {
        host: options.host,
        port: options.port,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error("Too many retries");
          }
          return Math.min(retries * 100, 3000);
        },
      },
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

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      return null; // Graceful degradation
    }
  }

  async set(key: string, val: any, ttlSec: number): Promise<void> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const value = JSON.stringify(val);
      await this.client.setEx(key, ttlSec, value);
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      // Don't throw - cache failures shouldn't break the service
    }
  }

  // Additional Redis-specific methods
  async del(key: string): Promise<void> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      await this.client.del(key);
    } catch (error) {
      console.error(`Redis DEL error for key ${key}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      return await this.client.ttl(key);
    } catch (error) {
      console.error(`Redis TTL error for key ${key}:`, error);
      return -1;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`Redis KEYS error for pattern ${pattern}:`, error);
      return [];
    }
  }

  async flushAll(): Promise<void> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      await this.client.flushAll();
    } catch (error) {
      console.error("Redis FLUSHALL error:", error);
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Redis PING error:", error);
      return false;
    }
  }

  // Stats for monitoring
  async getStats(): Promise<{
    connected: boolean;
    keyCount: number;
    memory: string;
  }> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const info = await this.client.info("memory");
      const dbSize = await this.client.dbSize();

      // Parse memory usage from info string
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memory = memoryMatch
        ? memoryMatch[1]?.trim() || "unknown"
        : "unknown";

      return {
        connected: this.connected,
        keyCount: dbSize,
        memory,
      };
    } catch (error) {
      console.error("Redis stats error:", error);
      return {
        connected: false,
        keyCount: 0,
        memory: "unknown",
      };
    }
  }
}
