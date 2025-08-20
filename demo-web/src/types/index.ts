// Core data types based on the microservices schemas

export type ISO = string;
export type Money = number;

export type ListingStatus = "Active" | "Sold" | "Suspended" | "Expired";
export type PropertyType = "Condo" | "House" | "Townhouse" | "Duplex";

export interface Address {
  street: string;
  city: string;
  province: string;
  postalCode?: string;
  country: string;
}

export interface Listing {
  id: string;
  mlsNumber?: string;
  sourceBoard: "TRREB" | "CREA" | "MOCK";
  status: ListingStatus;
  listedAt: ISO;
  updatedAt: ISO;

  address: Address;
  propertyType: PropertyType;
  beds: number;
  baths: number;
  sqft?: number;
  yearBuilt?: number;

  listPrice: Money;
  taxesAnnual?: Money;
  condoFeeMonthly?: Money;

  media?: {
    photos: string[];
    tourUrl?: string;
  };
  brokerage?: {
    name: string;
    phone?: string;
  };
}

export interface Enrichment {
  listingId: string;
  listingVersion: number;
  enrichmentVersion: string;

  geo?: {
    lat?: number;
    lng?: number;
    fsa?: string;
    neighborhood?: string;
    source: "listing" | "geocoded";
  };

  taxes?: {
    annualEstimate?: number;
    method: "exact" | "rate_table" | "unknown";
    notes?: string;
  };

  fees?: {
    condoFeeMonthly?: number;
    sanityFlags?: string[];
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
    lttRule?: string;
    insuranceMonthlyEstimate?: number;
  };

  computedAt: ISO;
}

export interface RentEstimate {
  listingId: string;
  listingVersion: number;
  estimatorVersion: string;
  method: "priors" | "comps" | "model";
  p25?: number;
  p50: number;
  p75?: number;
  stdev?: number;
  featuresUsed: {
    beds: number;
    baths: number;
    sqft?: number;
    propertyType: string;
    city: string;
    fsa?: string;
    comps?: Array<{
      id: string;
      rent: number;
      beds: number;
      baths: number;
      sqft?: number;
      distanceKm: number;
      daysOld: number;
    }>;
    priors?: {
      source: string;
      city: string;
      fsa?: string;
      asOf: ISO;
      p25: number;
      p50: number;
      p75: number;
    };
  };
  computedAt: ISO;
}

export interface UnderwritingMetrics {
  noi: number;
  capRate: number;
  cashFlow: number;
  coc: number; // Cash-on-Cash return
  dscr: number; // Debt Service Coverage Ratio
  breakeven: number; // Breakeven occupancy
  price: number;
  downPayment: number;
  loanAmount: number;
  monthlyDS: number; // Monthly Debt Service
}

export interface UnderwritingResult {
  listingId: string;
  listingVersion: number;
  resultId: string;
  source: "grid" | "exact";
  rentScenario: "P25" | "P50" | "P75";
  downPct: number;
  rateBps: number;
  amortMonths: number;
  metrics: UnderwritingMetrics;
  score?: number;
  computedAt: ISO;
}

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  filter: {
    city?: string;
    province?: string;
    propertyType?: string;
    minBeds?: number;
    maxPrice?: number;
  };
  thresholds: {
    minDSCR?: number;
    minCoC?: number;
    minCapRate?: number;
    minScore?: number;
    requireNonNegativeCF?: boolean;
  };
  notify: {
    channel: ("devbrowser" | "email" | "sms" | "slack" | "webhook")[];
  };
  isActive: boolean;
}

export interface Alert {
  id: string;
  userId: string;
  listingId: string;
  searchId: string;
  resultId: string;
  score?: number;
  triggeredAt: ISO;
  channels: string[];
  delivered: boolean;
  listing?: Listing;
  result?: UnderwritingResult;
}

// Event types
export interface ListingChangedEvent {
  type: "listing_changed";
  id: string;
  updatedAt: string;
  change: "create" | "update" | "status_change";
  source: "TRREB" | "CREA" | "MOCK";
  dirty?: string[];
}

export interface UnderwriteRequestedEvent {
  type: "underwrite_requested";
  id: string;
  assumptionsId?: string;
}

export interface UnderwriteCompletedEvent {
  type: "underwrite_completed";
  id: string;
  resultId: string;
  source: "grid" | "exact";
  score?: number;
}

export interface AlertFiredEvent {
  type: "alert_fired";
  userId: string;
  listingId: string;
  resultId: string;
  channel?: string;
}

// API Response types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: ISO;
}

export interface ListingWithAnalysis {
  listing: Listing;
  enrichment?: Enrichment;
  rentEstimate?: RentEstimate;
  underwriting?: UnderwritingResult[];
  alerts?: Alert[];
}

// UI State types
export interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  lastCheck: ISO;
  metrics?: {
    eventsProcessed?: number;
    errors?: number;
    uptime?: number;
  };
}

export interface SystemHealth {
  services: ServiceStatus[];
  eventBus: {
    status: "healthy" | "degraded" | "down";
    queueDepth: number;
  };
  database: {
    status: "healthy" | "degraded" | "down";
    connectionPool: number;
  };
}
