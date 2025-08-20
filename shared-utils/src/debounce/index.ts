/**
 * Shared debounce utilities for microservices
 */

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export interface DebounceEntry {
  listingId: string;
  firstEventAt: string;
  lastEventAt: string;
  dirty: string[];
  eventCount: number;
}

export interface DebounceResult {
  shouldProcess: boolean;
  reason: string;
  entry?: DebounceEntry;
}

/**
 * Simple in-memory debouncer for testing and lightweight usage
 */
export class MemoryDebouncer {
  private cache = new Map<string, number>();
  private windowMs: number;

  constructor(windowMs: number = 5 * 60 * 1000) {
    // 5 minutes default
    this.windowMs = windowMs;
  }

  shouldProcess(key: string): boolean {
    const now = Date.now();
    const lastProcessed = this.cache.get(key);

    if (!lastProcessed || now - lastProcessed > this.windowMs) {
      this.cache.set(key, now);
      return true;
    }

    return false;
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up old entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.windowMs) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Cache-based debouncer with advanced features
 */
export class CacheDebouncer {
  constructor(
    private cache: CachePort,
    private timeoutSec: number = 30,
    private immediateFields: string[] = ["price", "fees", "tax", "address"]
  ) {}

  async shouldProcess(
    listingId: string,
    dirty?: string[]
  ): Promise<DebounceResult> {
    const key = `debounce:${listingId}`;
    const existing = await this.cache.get<DebounceEntry>(key);

    // Check for immediate processing triggers
    const hasImmediateField = dirty?.some((field) =>
      this.immediateFields.includes(field)
    );

    if (hasImmediateField) {
      // Clear any existing debounce entry
      await this.cache.set(key, null as any, 0);
      return {
        shouldProcess: true,
        reason: `immediate_field: ${dirty
          ?.filter((f) => this.immediateFields.includes(f))
          .join(", ")}`,
      };
    }

    const now = new Date().toISOString();

    if (!existing) {
      // First event - start debounce timer
      const entry: DebounceEntry = {
        listingId,
        firstEventAt: now,
        lastEventAt: now,
        dirty: dirty || [],
        eventCount: 1,
      };

      await this.cache.set(key, entry, this.timeoutSec);
      return {
        shouldProcess: false,
        reason: "debounce_started",
        entry,
      };
    }

    // Update existing entry
    const updatedEntry: DebounceEntry = {
      ...existing,
      lastEventAt: now,
      dirty: this.mergeDirtyFields(existing.dirty, dirty || []),
      eventCount: existing.eventCount + 1,
    };

    // Check if debounce period has expired
    const firstEventTime = new Date(existing.firstEventAt).getTime();
    const currentTime = new Date().getTime();
    const elapsedSec = (currentTime - firstEventTime) / 1000;

    if (elapsedSec >= this.timeoutSec) {
      // Debounce period expired - process now
      await this.cache.set(key, null as any, 0); // Clear entry
      return {
        shouldProcess: true,
        reason: `debounce_expired: ${elapsedSec.toFixed(1)}s`,
        entry: updatedEntry,
      };
    }

    // Still within debounce period - extend timer
    await this.cache.set(key, updatedEntry, this.timeoutSec);
    return {
      shouldProcess: false,
      reason: `debounce_extended: ${elapsedSec.toFixed(1)}s remaining`,
      entry: updatedEntry,
    };
  }

  private mergeDirtyFields(existing: string[], incoming: string[]): string[] {
    const merged = new Set([...existing, ...incoming]);
    return Array.from(merged);
  }
}

/**
 * Simple debouncer for address-specific logic
 */
export class SimpleDebouncer {
  constructor(private cache: CachePort) {}

  async shouldProcess(
    listingId: string,
    isDirtyAddress: boolean = false
  ): Promise<boolean> {
    const key = `debounce:${listingId}`;

    // If address is dirty, always process immediately
    if (isDirtyAddress) {
      await this.cache.set(key, Date.now(), 60); // 60 second debounce
      return true;
    }

    // Check if we've processed this listing recently
    const lastProcessed = await this.cache.get<number>(key);
    if (lastProcessed) {
      return false; // Skip processing, still in debounce period
    }

    // Set debounce flag and allow processing
    await this.cache.set(key, Date.now(), 60); // 60 second debounce
    return true;
  }
}

/**
 * Factory function to create the appropriate debouncer
 */
export function createDebouncer(
  type: "memory" | "cache" | "simple",
  options: {
    cache?: CachePort;
    timeoutSec?: number;
    windowMs?: number;
    immediateFields?: string[];
  } = {}
) {
  switch (type) {
    case "memory":
      return new MemoryDebouncer(options.windowMs);

    case "cache":
      if (!options.cache) {
        throw new Error("Cache is required for cache debouncer");
      }
      return new CacheDebouncer(
        options.cache,
        options.timeoutSec,
        options.immediateFields
      );

    case "simple":
      if (!options.cache) {
        throw new Error("Cache is required for simple debouncer");
      }
      return new SimpleDebouncer(options.cache);

    default:
      throw new Error(`Unknown debouncer type: ${type}`);
  }
}
