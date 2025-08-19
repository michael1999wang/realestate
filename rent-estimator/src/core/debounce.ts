import { CachePort } from './ports';

export class DebounceService {
  constructor(private cache: CachePort) {}

  async shouldProcess(listingId: string, isDirtyAddress: boolean = false): Promise<boolean> {
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
