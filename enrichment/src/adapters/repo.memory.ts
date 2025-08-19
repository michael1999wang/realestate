import { Enrichment } from "../core/dto";
import { EnrichmentRepoPort, ListingReadPort } from "../core/ports";

export class MemoryEnrichmentRepo implements EnrichmentRepoPort {
  private store = new Map<string, Enrichment>();

  async getByListingId(id: string): Promise<Enrichment | null> {
    return this.store.get(id) ?? null;
  }

  async upsert(e: Enrichment): Promise<{ changed: boolean }> {
    const existing = this.store.get(e.listingId);
    const changed = !existing || JSON.stringify(existing) !== JSON.stringify(e);

    if (changed) {
      this.store.set(e.listingId, { ...e });
    }

    return { changed };
  }

  // Test helpers
  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  getAll(): Enrichment[] {
    return Array.from(this.store.values());
  }
}

export class MemoryListingRepo implements ListingReadPort {
  private store = new Map<
    string,
    {
      id: string;
      updatedAt: string;
      address: {
        street: string;
        city: string;
        province: string;
        postalCode?: string;
        lat?: number;
        lng?: number;
      };
      listPrice: number;
      taxesAnnual?: number;
      condoFeeMonthly?: number;
      propertyType: string;
    }
  >();

  async getListingById(id: string): Promise<{
    id: string;
    updatedAt: string;
    address: {
      street: string;
      city: string;
      province: string;
      postalCode?: string;
      lat?: number;
      lng?: number;
    };
    listPrice: number;
    taxesAnnual?: number;
    condoFeeMonthly?: number;
    propertyType: string;
  } | null> {
    return this.store.get(id) ?? null;
  }

  // Test helpers
  setListing(listing: {
    id: string;
    updatedAt: string;
    address: {
      street: string;
      city: string;
      province: string;
      postalCode?: string;
      lat?: number;
      lng?: number;
    };
    listPrice: number;
    taxesAnnual?: number;
    condoFeeMonthly?: number;
    propertyType: string;
  }): void {
    this.store.set(listing.id, listing);
  }

  clear(): void {
    this.store.clear();
  }
}
