import { Enrichment } from "./dto";

// Pull listing read-only snapshot needed for enrichment
export interface ListingReadPort {
  getListingById(id: string): Promise<{
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
  } | null>;
}

// Persist enrichment
export interface EnrichmentRepoPort {
  getByListingId(id: string): Promise<Enrichment | null>;
  upsert(e: Enrichment): Promise<{ changed: boolean }>;
}

// Bus publish/subscribe
export interface BusPort {
  subscribe(
    topic: "listing_changed",
    handler: (e: any) => Promise<void>
  ): Promise<void>;
  publish(evt: {
    type: "underwrite_requested";
    id: string;
    assumptionsId?: string;
  }): Promise<void>;
}

// External APIs (mockable)
export interface WalkScorePort {
  getScores(
    lat: number,
    lng: number
  ): Promise<{ walk?: number; transit?: number; bike?: number }>;
}

export interface CMHCPort {
  getRentPriors(params: {
    city?: string;
    fsa?: string;
    beds?: number;
    propertyType?: string;
  }): Promise<{
    p25?: number;
    p50?: number;
    p75?: number;
    asOf?: string;
  }>;
}

export interface TaxesPort {
  estimateAnnualTax(params: {
    city: string;
    province: string;
    assessedValue: number;
  }): Promise<{
    annual: number;
    method: "exact" | "rate_table" | "unknown";
  }>;
}

export interface GeocoderPort {
  geocode(
    street: string,
    city: string,
    province: string,
    postalCode?: string
  ): Promise<{
    lat?: number;
    lng?: number;
    fsa?: string;
    neighborhood?: string;
  }>;
}

// Cache
export interface CachePort {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, val: any, ttlSec: number): Promise<void>;
}
