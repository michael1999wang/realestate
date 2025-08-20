import { Alert, ListingSnapshot, SavedSearch } from "../core/dto";
import { AlertsRepo } from "../core/ports";

export class MemoryAlertsRepo implements AlertsRepo {
  private savedSearches: SavedSearch[] = [];
  private alerts: Alert[] = [];

  constructor(initialSearches: SavedSearch[] = []) {
    this.savedSearches = [...initialSearches];
  }

  async listActiveSavedSearches(): Promise<SavedSearch[]> {
    return this.savedSearches.filter((s) => s.isActive);
  }

  async listCandidatesForListing(
    listing: ListingSnapshot
  ): Promise<SavedSearch[]> {
    // Simple in-memory filtering - in real DB this would use indexes
    return this.savedSearches.filter((s) => {
      if (!s.isActive) return false;
      const f = s.filter;
      if (f.city && f.city.toLowerCase() !== listing.city.toLowerCase())
        return false;
      if (f.province && f.province !== listing.province) return false;
      if (f.propertyType && f.propertyType !== listing.propertyType)
        return false;
      if (f.minBeds && listing.beds < f.minBeds) return false;
      if (f.maxPrice && listing.price > f.maxPrice) return false;
      return true;
    });
  }

  async insertAlert(a: Alert): Promise<Alert> {
    this.alerts.push(a);
    return a;
  }

  // Helper methods for testing
  addSavedSearch(search: SavedSearch): void {
    this.savedSearches.push(search);
  }

  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  clear(): void {
    this.savedSearches = [];
    this.alerts = [];
  }
}
