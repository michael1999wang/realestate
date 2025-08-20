import { ListingSnapshot, UWMetrics } from "../core/dto";
import { ReadPort } from "../core/ports";

export class MockReadAdapter implements ReadPort {
  private listings: Map<string, ListingSnapshot> = new Map();
  private metrics: Map<string, UWMetrics> = new Map();

  constructor(
    initialListings: ListingSnapshot[] = [],
    initialMetrics: Array<{ resultId: string; metrics: UWMetrics }> = []
  ) {
    initialListings.forEach((listing) =>
      this.listings.set(listing.id, listing)
    );
    initialMetrics.forEach(({ resultId, metrics }) =>
      this.metrics.set(resultId, metrics)
    );
  }

  async getListingSnapshot(listingId: string): Promise<ListingSnapshot | null> {
    return this.listings.get(listingId) || null;
  }

  async getUnderwriteMetrics(resultId: string): Promise<UWMetrics | null> {
    return this.metrics.get(resultId) || null;
  }

  // Helper methods for testing
  addListing(listing: ListingSnapshot): void {
    this.listings.set(listing.id, listing);
  }

  addMetrics(resultId: string, metrics: UWMetrics): void {
    this.metrics.set(resultId, metrics);
  }

  clear(): void {
    this.listings.clear();
    this.metrics.clear();
  }
}
