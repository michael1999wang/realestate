import {
  Assumptions,
  BaseInputs,
  GridRow,
  ListingChangedEvt,
  Metrics,
  UnderwriteCompletedEvt,
  UnderwriteRequestedEvt,
} from "./dto";

// Read-only snapshot of inputs (join of listings + enrichment + rent)
export interface SnapshotReadPort {
  loadBaseInputs(listingId: string): Promise<BaseInputs | null>;
}

// Assumptions read (defaults or user-defined)
export interface AssumptionsReadPort {
  getAssumptionsById(id: string): Promise<Assumptions | null>;
  getDefaultAssumptions(): Promise<Assumptions>;
}

// Persistence (grid/exact/factors/versions)
export interface UWRepoPort {
  upsertGrid(rows: GridRow[]): Promise<void>;
  getGridRow(
    listingId: string,
    listingVersion: number,
    rentScenario: string,
    downPctBin: number,
    rateBpsBin: number,
    amortMonths: number
  ): Promise<GridRow | null>;
  saveExact(
    listingId: string,
    listingVersion: number,
    assumptionsHash: string,
    metrics: Metrics
  ): Promise<{ id: string; created: boolean }>;
  getExact(
    listingId: string,
    listingVersion: number,
    assumptionsHash: string
  ): Promise<{ id: string; metrics: Metrics } | null>;
  bumpVersionOnListing(
    listingId: string,
    listingVersion: number
  ): Promise<void>;
}

// Mortgage annuity factors (AF = PMT/Loan monthly)
export interface FactorsPort {
  getAF(rateBps: number, amortMonths: number): Promise<number>; // precomputed or compute on the fly and cache
}

// Bus
export interface BusPort {
  subscribe(
    topic: "underwrite_requested" | "listing_changed",
    handler: (evt: UnderwriteRequestedEvt | ListingChangedEvt) => Promise<void>
  ): Promise<void>;
  publish(evt: UnderwriteCompletedEvt): Promise<void>;
}
