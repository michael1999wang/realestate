export type ISO = string;

export interface Enrichment {
  listingId: string;
  listingVersion: number; // from listings table if available
  enrichmentVersion: string; // semver for enrichment logic (e.g., "1.0.0")

  geo?: {
    lat?: number;
    lng?: number;
    fsa?: string; // postal FSA e.g., "M5V"
    neighborhood?: string;
    source: "listing" | "geocoded";
  };

  taxes?: {
    annualEstimate?: number; // CAD
    method: "exact" | "rate_table" | "unknown";
    notes?: string;
  };

  fees?: {
    condoFeeMonthly?: number; // carry through or normalize
    sanityFlags?: string[]; // e.g., ["fee_missing", "fee_outlier"]
  };

  rentPriors?: {
    p25?: number;
    p50?: number;
    p75?: number;
    source: "cmhc" | "table" | "none";
    metro?: string;
    fsa?: string;
    asOf?: ISO;
  };

  locationScores?: {
    walk?: number;
    transit?: number;
    bike?: number;
    provider: "walkscore";
  };

  costRules?: {
    lttRule?: string; // e.g., "toronto_double"
    insuranceMonthlyEstimate?: number;
  };

  computedAt: ISO;
}

export type ListingChangedEvent = {
  type: "listing_changed";
  id: string;
  updatedAt: ISO;
  change: "create" | "update" | "status_change";
  source: "TRREB" | "CREA" | "MOCK";
  dirty?: ("price" | "status" | "fees" | "tax" | "media" | "address")[];
};

export type UnderwriteRequestedEvt = {
  type: "underwrite_requested";
  id: string;
  assumptionsId?: string;
};
