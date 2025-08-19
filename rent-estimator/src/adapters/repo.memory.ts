import { RentEstimate } from "../core/dto";
import { RentRepoPort } from "../core/ports";

export class MemoryRentRepo implements RentRepoPort {
  private estimates = new Map<string, RentEstimate>();

  async getByListingId(id: string): Promise<RentEstimate | null> {
    const estimate = this.estimates.get(id);
    return estimate ? JSON.parse(JSON.stringify(estimate)) : null; // Deep clone
  }

  async upsert(est: RentEstimate): Promise<{ changed: boolean }> {
    const existing = this.estimates.get(est.listingId);
    const changed =
      !existing || JSON.stringify(existing) !== JSON.stringify(est);

    if (changed) {
      this.estimates.set(est.listingId, JSON.parse(JSON.stringify(est))); // Deep clone
    }

    return { changed };
  }

  // Helper methods for testing
  clear(): void {
    this.estimates.clear();
  }

  size(): number {
    return this.estimates.size;
  }

  getAll(): RentEstimate[] {
    return Array.from(this.estimates.values());
  }
}
