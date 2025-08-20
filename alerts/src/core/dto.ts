export type ISO = string;

export type UnderwriteCompletedEvt = {
  id: string;                 // listingId
  resultId: string;           // underwrite row id
  score?: number;             // optional
  source: "grid" | "exact";
  type: "underwrite_completed";
  ts?: ISO;
};

export type PropertyScoredEvt = {
  id: string;                 // listingId
  score: number;
  type: "property_scored";
  ts?: ISO;
};

export type ListingSnapshot = {
  id: string;
  city: string;
  province: string;
  propertyType: string;
  beds: number;
  baths: number;
  price: number;
};

export type UWMetrics = {
  dscr?: number;
  cashOnCashPct?: number;
  cashFlowAnnual?: number;
  capRatePct?: number;
  irrPct?: number;
};

export type SavedSearch = {
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
  assumptionsId?: string; // used upstream
  thresholds: {
    minDSCR?: number;
    minCoC?: number;           // 0.06 = 6%
    minCapRate?: number;
    minScore?: number;         // if using overall score
    requireNonNegativeCF?: boolean;
  };
  notify: {
    channel: ("devbrowser"|"email"|"sms"|"slack"|"webhook")[];
  };
  isActive: boolean;
  createdAt: ISO;
};

export type Alert = {
  id: string;
  userId: string;
  savedSearchId: string;
  listingId: string;
  resultId?: string;
  triggeredAt: ISO;
  payload: {
    snapshot: ListingSnapshot;
    metrics?: UWMetrics;
    score?: number;
    matched: string[]; // which rules matched
  };
  delivery: {
    channels: string[];
    statusByChannel: Record<string,"queued"|"sent"|"failed">;
  };
};
