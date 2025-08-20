/**
 * Generic in-memory cache with TTL support
 *
 * Methods align with service CachePort contracts:
 * - get<T>(key)
 * - set(key, val, ttlSec)
 * Plus helpful test/dev utilities:
 * - clear(), size(), has(key)
 */

type CacheEntry = {
  value: unknown;
  expiresAt: number; // epoch ms
};

export class MemoryCache {
  private store = new Map<string, CacheEntry>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set(key: string, val: unknown, ttlSec: number): Promise<void> {
    const expiresAt = Date.now() + ttlSec * 1000;
    this.store.set(key, { value: val, expiresAt });
  }

  // Utilities for tests/dev
  clear(): void {
    this.store.clear();
  }

  size(): number {
    // Sweep expired entries before reporting size
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }
}

export default MemoryCache;
