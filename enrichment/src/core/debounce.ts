import { CachePort } from "./ports";

export interface DebounceEntry {
  listingId: string;
  firstEventAt: string;
  lastEventAt: string;
  dirty: string[];
  eventCount: number;
}

export class Debouncer {
  constructor(private cache: CachePort, private timeoutSec: number = 30) {}

  async shouldProcess(
    listingId: string,
    dirty?: string[]
  ): Promise<{
    shouldProcess: boolean;
    reason: string;
    entry?: DebounceEntry;
  }> {
    const key = `debounce:${listingId}`;
    const existing = await this.cache.get<DebounceEntry>(key);

    // Immediate processing triggers
    const immediateFields = ["price", "fees", "tax", "address"];
    const hasImmediateField = dirty?.some((field) =>
      immediateFields.includes(field)
    );

    if (hasImmediateField) {
      // Clear any existing debounce entry
      await this.cache.set(key, null, 0);
      return {
        shouldProcess: true,
        reason: `immediate_field: ${dirty
          ?.filter((f) => immediateFields.includes(f))
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
      await this.cache.set(key, null, 0); // Clear entry
      return {
        shouldProcess: true,
        reason: `debounce_expired: ${elapsedSec.toFixed(1)}s`,
        entry: updatedEntry,
      };
    }

    // Still within debounce period - extend timer
    const remainingTtl = this.timeoutSec - Math.floor(elapsedSec);
    await this.cache.set(key, updatedEntry, remainingTtl);

    return {
      shouldProcess: false,
      reason: `debounce_extended: ${remainingTtl}s remaining`,
      entry: updatedEntry,
    };
  }

  private mergeDirtyFields(existing: string[], incoming: string[]): string[] {
    const combined = new Set([...existing, ...incoming]);
    return Array.from(combined);
  }

  async getDebounceStatus(listingId: string): Promise<DebounceEntry | null> {
    const key = `debounce:${listingId}`;
    return await this.cache.get<DebounceEntry>(key);
  }

  async clearDebounce(listingId: string): Promise<void> {
    const key = `debounce:${listingId}`;
    await this.cache.set(key, null, 0);
  }

  async getAllPendingDebounces(): Promise<DebounceEntry[]> {
    // This is a simplified implementation - in production you might want
    // to use a more efficient approach like storing debounce keys in a set
    const keys = (await (this.cache as any).keys?.("debounce:*")) || [];
    const entries: DebounceEntry[] = [];

    for (const key of keys) {
      const entry = await this.cache.get<DebounceEntry>(key);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }
}
