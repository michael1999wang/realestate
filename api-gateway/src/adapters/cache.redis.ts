/**
 * Redis Cache Adapter for API Gateway
 *
 * Provides caching capabilities for frequently accessed data
 * and rate limiting functionality.
 */

import Redis from "ioredis";
import { redisCfg } from "../config/env";
import { CachePort, RateLimitPort } from "../core/ports";

export class RedisCacheAdapter implements CachePort, RateLimitPort {
  private redis: Redis;

  constructor(redisClient?: Redis) {
    this.redis =
      redisClient ||
      new Redis({
        host: redisCfg.host,
        port: redisCfg.port,
        password: redisCfg.password,
        db: redisCfg.db,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
      });
  }

  // ===== Cache Methods =====

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      console.error(`Cache SET error for key ${key}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`Cache DELETE error for key ${key}:`, error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error(`Cache INVALIDATE error for pattern ${pattern}:`, error);
    }
  }

  // ===== Rate Limiting Methods =====

  async isAllowed(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const key = `rate_limit:${identifier}`;
      const windowSeconds = Math.floor(windowMs / 1000);
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;

      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(key, 0, now - windowMs);
      pipeline.zcard(key);
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.expire(key, windowSeconds);

      const results = await pipeline.exec();

      if (!results) {
        throw new Error("Redis pipeline failed");
      }

      const currentCount = (results[1][1] as number) || 0;
      const allowed = currentCount < limit;
      const remaining = Math.max(0, limit - currentCount - 1);
      const resetTime = windowStart + windowMs;

      if (!allowed) {
        // Remove the request we just added since it's not allowed
        await this.redis.zrem(key, `${now}-${Math.random()}`);
      }

      return { allowed, remaining, resetTime };
    } catch (error) {
      console.error(`Rate limit check error for ${identifier}:`, error);
      // Fail open - allow the request if Redis is down
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: Date.now() + windowMs,
      };
    }
  }

  async getRemainingQuota(identifier: string): Promise<number> {
    try {
      const key = `rate_limit:${identifier}`;
      const count = await this.redis.zcard(key);
      return count || 0;
    } catch (error) {
      console.error(`Rate limit quota check error for ${identifier}:`, error);
      return 0;
    }
  }

  // ===== Health Check =====

  async isHealthy(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error("Redis health check failed:", error);
      return false;
    }
  }

  // ===== Cleanup =====

  async close(): Promise<void> {
    await this.redis.quit();
  }

  // ===== Cache Key Generators =====

  static cacheKeys = {
    listing: (id: string) => `listing:${id}`,
    listingSearch: (searchHash: string) => `search:listings:${searchHash}`,
    enrichment: (listingId: string) => `enrichment:${listingId}`,
    rentEstimate: (listingId: string) => `rent_estimate:${listingId}`,
    underwriting: (listingId: string, scenario?: string) =>
      scenario
        ? `underwriting:${listingId}:${scenario}`
        : `underwriting:${listingId}`,
    healthCheck: (serviceName: string) => `health:${serviceName}`,
    user: (userId: string) => `user:${userId}`,
    savedSearches: (userId: string) => `saved_searches:${userId}`,
    alerts: (userId: string) => `alerts:${userId}`,
  };

  // ===== Helper Methods =====

  /**
   * Generate cache key hash from search parameters
   */
  static hashSearchParams(params: Record<string, any>): string {
    const sorted = Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== null)
      .sort()
      .map((key) => `${key}:${params[key]}`)
      .join("|");

    return Buffer.from(sorted).toString("base64").replace(/[+/=]/g, "");
  }

  /**
   * Batch get multiple keys
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys);
      return values.map((value) => (value ? JSON.parse(value) : null));
    } catch (error) {
      console.error(`Cache MGET error for keys ${keys.join(", ")}:`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Batch set multiple key-value pairs
   */
  async mset<T>(
    keyValuePairs: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      for (const { key, value, ttl } of keyValuePairs) {
        const serialized = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }

      await pipeline.exec();
    } catch (error) {
      console.error("Cache MSET error:", error);
    }
  }
}
