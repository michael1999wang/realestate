import { CachePort } from "../core/ports";

interface CacheEntry {
  value: any;
  expiresAt: number;
}

export class MemoryCache implements CachePort {
  private store = new Map<string, CacheEntry>();

  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set(key: string, val: any, ttlSec: number): Promise<void> {
    const expiresAt = Date.now() + ttlSec * 1000;
    this.store.set(key, { value: val, expiresAt });
  }

  // Test helpers
  clear(): void {
    this.store.clear();
  }

  size(): number {
    // Clean expired entries first
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
