import { SavedSearch, ListingSnapshot, UWMetrics, Alert } from "./dto";

// Bus
export interface BusPort {
  subscribe(topic: "underwrite_completed" | "property_scored", handler: (evt:any)=>Promise<void>): Promise<void>;
  // Optionally publish internal events (not required now)
}

// Read ports (snapshots needed to render alerts)
export interface ReadPort {
  getListingSnapshot(listingId: string): Promise<ListingSnapshot | null>;
  getUnderwriteMetrics(resultId: string): Promise<UWMetrics | null>;
}

// Repo for saved searches & alerts
export interface AlertsRepo {
  listActiveSavedSearches(): Promise<SavedSearch[]>;
  listCandidatesForListing(listing: ListingSnapshot): Promise<SavedSearch[]>; // DB-side prefilter
  insertAlert(a: Alert): Promise<Alert>;
}

// Dispatch (multi-channel)
export interface Dispatcher {
  sendDevBrowser(a: Alert): Promise<void>;
  sendEmail(a: Alert): Promise<void>;
  sendSMS(a: Alert): Promise<void>;
  sendSlack(a: Alert): Promise<void>;
  sendWebhook(a: Alert): Promise<void>;
}
