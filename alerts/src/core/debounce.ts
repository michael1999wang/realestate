// Debounce utility to prevent duplicate alerts within a time window
export class Debouncer {
  private cache = new Map<string, number>();
  private windowMs: number;

  constructor(windowMs: number = 5 * 60 * 1000) { // 5 minutes default
    this.windowMs = windowMs;
  }

  shouldProcess(key: string): boolean {
    const now = Date.now();
    const lastProcessed = this.cache.get(key);
    
    if (!lastProcessed || (now - lastProcessed) > this.windowMs) {
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
      if ((now - timestamp) > this.windowMs) {
        this.cache.delete(key);
      }
    }
  }
}
