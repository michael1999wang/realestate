export type ISO = string;
export type Money = number;

export type Listing = {
  id: string;
  city: string;
  province: string;
  propertyType: string;
  beds: number;
  baths: number;
  listPrice: Money;
  address?: {
    street?: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
  };
  media?: {
    photos?: string[];
  };
};

export type Enrichment = {
  geo?: {
    lat?: number;
    lng?: number;
    fsa?: string;
  };
  taxes?: {
    annualEstimate?: number;
  };
  fees?: {
    condoFeeMonthly?: number;
  };
  rentPriors?: {
    p25?: number;
    p50?: number;
    p75?: number;
  };
  locationScores?: {
    walk?: number;
    transit?: number;
    bike?: number;
  };
};

export type RentEstimate = {
  p25?: number;
  p50: number;
  p75?: number;
  method: "priors" | "comps" | "model";
};

export type UWMetrics = {
  price: Money;
  noi: Money;
  capRatePct: number;
  loan: Money;
  dsAnnual: Money;
  cashFlowAnnual: Money;
  dscr: number;
  cashOnCashPct: number;
  irrPct?: number;
};

export type ListingDetail = {
  listing: Listing;
  enrichment?: Enrichment;
  rent?: RentEstimate;
  latestUW?: UWMetrics;
};

export type Assumptions = {
  downPct: number;
  rateBps: number;
  amortMonths: number;
  rentScenario: "P25" | "P50" | "P75";
};

export type SavedSearch = {
  id: string;
  name: string;
  filter: {
    city?: string;
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
};

export type Alert = {
  id: string;
  listingId: string;
  userId: string;
  savedSearchId: string;
  triggeredAt: ISO;
  payload: {
    snapshot: Listing;
    metrics?: UWMetrics;
    matched?: string[];
  };
};
