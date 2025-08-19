import { Listing, ListingChangedEvent } from "./dto";

// Source of truth (TRREB/CREA/Mock)
export interface SourcePort {
  fetchUpdatedSince(
    since: string,
    pageToken?: string
  ): Promise<{ items: any[]; nextPage?: string; maxUpdatedAt: string }>;
}

// Persistence for listings + watermark
export interface RepoPort {
  getWatermark(source: string): Promise<string | null>;
  setWatermark(source: string, watermark: string): Promise<void>;
  upsert(listing: Listing): Promise<{
    changed: boolean;
    dirty?: ("price" | "status" | "fees" | "tax" | "media" | "address")[];
    changeType: "create" | "update" | "status_change" | "noop";
  }>;
  markInactive(id: string): Promise<void>;
}

// Event bus
export interface BusPort {
  publish(evt: ListingChangedEvent): Promise<void>;
}
