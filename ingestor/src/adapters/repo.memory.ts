import { DirtyField, Listing } from "../core/dto";
import { RepoPort } from "../core/ports";
import { deepEqual } from "../core/utils";

export class MemoryRepo implements RepoPort {
  private listings = new Map<string, Listing>();
  private watermarks = new Map<string, string>();

  async getWatermark(source: string): Promise<string | null> {
    return this.watermarks.get(source) || null;
  }

  async setWatermark(source: string, watermark: string): Promise<void> {
    this.watermarks.set(source, watermark);
  }

  async upsert(listing: Listing): Promise<{
    changed: boolean;
    dirty?: DirtyField[];
    changeType: "create" | "update" | "status_change" | "noop";
  }> {
    const existing = this.listings.get(listing.id);

    if (!existing) {
      // New listing - create
      this.listings.set(listing.id, { ...listing });
      return {
        changed: true,
        changeType: "create",
      };
    }

    // Check if this is the exact same data (idempotent check)
    if (
      existing.updatedAt === listing.updatedAt &&
      deepEqual(existing, listing)
    ) {
      return {
        changed: false,
        changeType: "noop",
      };
    }

    // Detect what changed
    const dirty: DirtyField[] = [];
    let changeType: "update" | "status_change" = "update";

    // Check for price changes
    if (existing.listPrice !== listing.listPrice) {
      dirty.push("price");
    }

    // Check for status changes
    if (existing.status !== listing.status) {
      dirty.push("status");
      changeType = "status_change";
    }

    // Check for fee changes
    if (existing.condoFeeMonthly !== listing.condoFeeMonthly) {
      dirty.push("fees");
    }

    // Check for tax changes
    if (existing.taxesAnnual !== listing.taxesAnnual) {
      dirty.push("tax");
    }

    // Check for media changes
    if (!deepEqual(existing.media, listing.media)) {
      dirty.push("media");
    }

    // Check for address changes
    if (!deepEqual(existing.address, listing.address)) {
      dirty.push("address");
    }

    // Update the listing
    this.listings.set(listing.id, { ...listing });

    return {
      changed: dirty.length > 0,
      dirty: dirty.length > 0 ? dirty : undefined,
      changeType: dirty.length > 0 ? changeType : "noop",
    };
  }

  async markInactive(id: string): Promise<void> {
    const listing = this.listings.get(id);
    if (listing) {
      listing.status = "Expired";
      listing.updatedAt = new Date().toISOString();
    }
  }

  // Helper methods for testing and debugging
  getAllListings(): Listing[] {
    return Array.from(this.listings.values());
  }

  getListing(id: string): Listing | undefined {
    return this.listings.get(id);
  }

  clear(): void {
    this.listings.clear();
    this.watermarks.clear();
  }

  size(): number {
    return this.listings.size;
  }
}
