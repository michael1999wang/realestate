import { CachePort } from '../core/ports';

interface CacheEntry {
  value: any;
  expiresAt: number;
}

export class MemoryCache implements CachePort {
  private cache = new Map<string, CacheEntry>();

  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set(key: string, val: any, ttlSec: number): Promise<void> {
    const expiresAt = Date.now() + (ttlSec * 1000);
    this.cache.set(key, { value: val, expiresAt });
  }

  // Helper methods for testing
  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
}
