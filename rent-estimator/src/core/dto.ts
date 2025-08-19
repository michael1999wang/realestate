export type ISO = string;

export type RentMethod = "priors" | "comps" | "model";

export interface RentEstimate {
  listingId: string;
  listingVersion: number; // from listings/enrichment if tracked
  estimatorVersion: string; // semver, e.g. "1.0.0"
  method: RentMethod;
  p25?: number; // monthly CAD
  p50: number;
  p75?: number;
  stdev?: number; // optional
  featuresUsed: {
    beds?: number;
    baths?: number;
    sqft?: number;
    propertyType?: string;
    city?: string;
    fsa?: string;
    comps?: Array<{
      id: string;
      rent: number;
      beds?: number;
      baths?: number;
      sqft?: number;
      distanceKm?: number;
      daysOld?: number;
    }>;
    priors?: {
      source: "cmhc" | "table";
      city?: string;
      fsa?: string;
      asOf?: ISO;
      p25?: number;
      p50?: number;
      p75?: number;
    };
  };
  computedAt: ISO;
}

export type ListingChangedEvt = {
  type: "listing_changed";
  id: string;
  updatedAt: ISO;
  change: "create" | "update" | "status_change";
  source: "TRREB" | "CREA" | "MOCK";
  dirty?: ("price" | "status" | "fees" | "tax" | "media" | "address")[];
};

export type DataEnrichedEvt = {
  type: "data_enriched";
  id: string;
  updatedAt: ISO;
};

export type UnderwriteRequestedEvt = {
  type: "underwrite_requested";
  id: string;
  assumptionsId?: string;
};
