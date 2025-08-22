/**
 * API Gateway DTOs and Type Definitions
 *
 * These types define the HTTP API contracts exposed by the gateway.
 * The gateway composes data from multiple services without containing business logic.
 */

// ===== Core Domain Types =====

export interface Listing {
  id: string;
  mlsNumber: string;
  sourceBoard: string;
  status: "Active" | "Sold" | "Suspended" | "Expired";
  listedAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp

  address: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };

  propertyType: "Condo" | "House" | "Townhouse";
  beds: number;
  baths: number;
  sqft?: number;

  listPrice: number;
  taxesAnnual?: number;
  condoFeeMonthly?: number;

  media?: {
    photos?: string[];
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
    asOf?: string; // ISO timestamp
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

  computedAt: string; // ISO timestamp
}

export interface RentEstimate {
  listingId: string;
  listingVersion: number;
  estimatorVersion: string;
  method: "priors" | "comps" | "model";

  // Estimate percentiles
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
      asOf: string;
      p25: number;
      p50: number;
      p75: number;
    };
  };

  computedAt: string; // ISO timestamp
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

  metrics: {
    noi: number;
    capRate: number;
    cashFlow: number;
    coc: number; // Cash-on-Cash return
    dscr: number; // Debt Service Coverage Ratio
    breakeven: number;
    price: number;
    downPayment: number;
    loanAmount: number;
    monthlyDS: number; // Debt Service
  };

  score?: number; // Investment score (0-1)
  computedAt: string; // ISO timestamp
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
    requireNonNegativeCF?: boolean;
  };

  notify: {
    channel: Array<"devbrowser" | "email" | "sms" | "slack">;
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
  triggeredAt: string; // ISO timestamp
  channels: string[];
  delivered: boolean;
}

// ===== API Request/Response Types =====

export interface PropertySearchRequest {
  city?: string;
  province?: string;
  propertyType?: "Condo" | "House" | "Townhouse";
  minBeds?: number;
  maxBeds?: number;
  minPrice?: number;
  maxPrice?: number;
  status?: "Active" | "Sold" | "Suspended" | "Expired";
  limit?: number;
  offset?: number;
}

export interface PropertySearchResponse {
  listings: Listing[];
  total: number;
  offset: number;
  limit: number;
}

export interface PropertyDetailResponse {
  listing: Listing;
  enrichment?: Enrichment;
  rentEstimate?: RentEstimate;
  underwriting: UnderwritingResult[];
  alerts: Alert[];
}

export interface UnderwriteRequest {
  listingId: string;
  assumptions?: {
    downPct: number;
    rateBps: number;
    amortMonths: number;
    rentScenario: "P25" | "P50" | "P75";
  };
}

export interface UnderwriteResponse {
  resultId: string;
  metrics: UnderwritingResult["metrics"];
  fromCache?: boolean;
}

// ===== API Gateway Response Wrapper =====

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// ===== Authentication Types =====

export interface User {
  id: string;
  email: string;
  subscriptionTier: "free" | "pro" | "enterprise";
  apiQuota: {
    requests: number;
    remaining: number;
    resetAt: string;
  };
}

export interface AuthRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  expiresAt: string;
}

// ===== System Health =====

export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  services: {
    [serviceName: string]: {
      status: "healthy" | "degraded" | "down";
      responseTime?: number;
      lastCheck: string;
    };
  };
  version: string;
}
