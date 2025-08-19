export type ISO = string;
export type Money = number;

export interface BaseInputs {
  listingId: string;
  listingVersion: number;         // bump when price/fees/taxes/rent change
  price: Money;                   // ask/list
  closingCosts: Money;            // computed from rules (enrichment)
  noiP25: Money;
  noiP50: Money;
  noiP75: Money;
  city: string;
  province: string;
  propertyType: string;
}

export interface Assumptions {
  downPct: number;                // 0.05..0.35
  rateBps: number;                // e.g., 500 = 5.00%
  amortMonths: number;            // 240, 300, 360
  rentScenario: "P25" | "P50" | "P75"; // choose which NOI to use
  mgmtPct?: number;               // optional extra OpEx (if not in NOI)
  reservesMonthly?: number;       // optional reserve
  exitCapPct?: number;            // optional for IRR
  growthRentPct?: number;         // optional for IRR
  growthExpensePct?: number;      // optional for IRR
  holdYears?: number;             // optional for IRR
}

export interface Metrics {
  price: Money;
  noi: Money;
  capRatePct: number;             // NOI / price
  loan: Money;                    // price * (1-downPct)
  dsAnnual: Money;                // 12 * PMT
  cashFlowAnnual: Money;          // NOI - DS
  dscr: number;                   // NOI / DS
  cashOnCashPct: number;          // CF / (down + closing)
  breakevenOccPct: number;        // if you expose it (optional)
  irrPct?: number;                // optional, if IRR enabled
  inputs: Assumptions;
}

export interface GridRow {
  listingId: string;
  listingVersion: number;
  rentScenario: "P25" | "P50" | "P75";
  downPctBin: number;             // e.g., 0.20
  rateBpsBin: number;             // e.g., 500
  amortMonths: number;            // 240/300/360
  metrics: Metrics;
}

export type ListingChangedEvt = {
  type: "listing_changed";
  id: string;
  updatedAt: ISO;
  change: "create" | "update" | "status_change";
  source: "TRREB" | "CREA" | "MOCK";
  dirty?: ("price"|"status"|"fees"|"tax"|"media"|"address")[];
};

export type UnderwriteRequestedEvt = {
  type: "underwrite_requested";
  id: string;                     // listingId
  assumptionsId?: string;         // optional user set
};

export type UnderwriteCompletedEvt = {
  type: "underwrite_completed";
  id: string;
  resultId: string;               // db key of last calc (grid or exact)
  score?: number;                 // if you compute a score; else omit
  source: "grid" | "exact";
};
