import {
  generateNewListing,
  getListingWithAnalysis,
  mockData,
} from "../data/mockData";
import {
  Alert,
  APIResponse,
  Enrichment,
  Listing,
  ListingWithAnalysis,
  RentEstimate,
  SavedSearch,
  SystemHealth,
  UnderwritingResult,
} from "../types";

// Simulate API delays
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Base API response wrapper
function createResponse<T>(data: T): APIResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function createErrorResponse(error: string): APIResponse<never> {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString(),
  };
}

// API Service Class
export class APIService {
  private static instance: APIService;
  private eventSource: EventSource | null = null;
  private eventListeners: { [key: string]: ((data: any) => void)[] } = {};

  static getInstance(): APIService {
    if (!APIService.instance) {
      APIService.instance = new APIService();
    }
    return APIService.instance;
  }

  // Listings API
  async getListings(): Promise<APIResponse<Listing[]>> {
    await delay(300);
    return createResponse(mockData.listings);
  }

  async getListing(id: string): Promise<APIResponse<Listing | null>> {
    await delay(200);
    const listing = mockData.listings.find((l) => l.id === id);
    return createResponse(listing || null);
  }

  async getListingWithAnalysis(
    id: string
  ): Promise<APIResponse<ListingWithAnalysis | null>> {
    await delay(400);
    const analysis = getListingWithAnalysis(id);
    return createResponse(analysis);
  }

  // Enrichments API
  async getEnrichments(): Promise<APIResponse<Enrichment[]>> {
    await delay(250);
    return createResponse(mockData.enrichments);
  }

  async getEnrichment(
    listingId: string
  ): Promise<APIResponse<Enrichment | null>> {
    await delay(150);
    const enrichment = mockData.enrichments.find(
      (e) => e.listingId === listingId
    );
    return createResponse(enrichment || null);
  }

  // Rent Estimates API
  async getRentEstimates(): Promise<APIResponse<RentEstimate[]>> {
    await delay(200);
    return createResponse(mockData.rentEstimates);
  }

  async getRentEstimate(
    listingId: string
  ): Promise<APIResponse<RentEstimate | null>> {
    await delay(150);
    const estimate = mockData.rentEstimates.find(
      (r) => r.listingId === listingId
    );
    return createResponse(estimate || null);
  }

  // Underwriting API
  async getUnderwritingResults(
    listingId?: string
  ): Promise<APIResponse<UnderwritingResult[]>> {
    await delay(300);
    const results = listingId
      ? mockData.underwritingResults.filter((u) => u.listingId === listingId)
      : mockData.underwritingResults;
    return createResponse(results);
  }

  async requestUnderwriting(
    listingId: string,
    assumptionsId?: string
  ): Promise<APIResponse<{ jobId: string }>> {
    await delay(500);
    // Simulate underwriting request
    return createResponse({ jobId: `job-${Date.now()}` });
  }

  // Saved Searches API
  async getSavedSearches(): Promise<APIResponse<SavedSearch[]>> {
    await delay(200);
    return createResponse(mockData.savedSearches);
  }

  async createSavedSearch(
    search: Omit<SavedSearch, "id">
  ): Promise<APIResponse<SavedSearch>> {
    await delay(300);
    const newSearch: SavedSearch = {
      ...search,
      id: `search-${Date.now()}`,
    };
    mockData.savedSearches.push(newSearch);
    return createResponse(newSearch);
  }

  async updateSavedSearch(
    id: string,
    updates: Partial<SavedSearch>
  ): Promise<APIResponse<SavedSearch>> {
    await delay(250);
    const index = mockData.savedSearches.findIndex((s) => s.id === id);
    if (index === -1) {
      return createErrorResponse("Search not found");
    }

    mockData.savedSearches[index] = {
      ...mockData.savedSearches[index],
      ...updates,
    };
    return createResponse(mockData.savedSearches[index]);
  }

  async deleteSavedSearch(id: string): Promise<APIResponse<boolean>> {
    await delay(200);
    const index = mockData.savedSearches.findIndex((s) => s.id === id);
    if (index === -1) {
      return createErrorResponse("Search not found");
    }

    mockData.savedSearches.splice(index, 1);
    return createResponse(true);
  }

  // Alerts API
  async getAlerts(): Promise<APIResponse<Alert[]>> {
    await delay(200);
    return createResponse(mockData.alerts);
  }

  async dismissAlert(id: string): Promise<APIResponse<boolean>> {
    await delay(150);
    // In a real app, this would mark the alert as dismissed
    return createResponse(true);
  }

  // System Health API
  async getSystemHealth(): Promise<APIResponse<SystemHealth>> {
    await delay(400);
    return createResponse(mockData.systemHealth);
  }

  // Real-time Events API (Server-Sent Events simulation)
  subscribeToEvents(eventType: string, callback: (data: any) => void) {
    if (!this.eventListeners[eventType]) {
      this.eventListeners[eventType] = [];
    }
    this.eventListeners[eventType].push(callback);

    // Simulate real-time events
    this.startEventSimulation(eventType);
  }

  unsubscribeFromEvents(eventType: string, callback: (data: any) => void) {
    if (this.eventListeners[eventType]) {
      this.eventListeners[eventType] = this.eventListeners[eventType].filter(
        (cb) => cb !== callback
      );
    }
  }

  private startEventSimulation(eventType: string) {
    if (eventType === "listings") {
      // Simulate new listings every 5-10 seconds
      const interval = setInterval(() => {
        if (this.eventListeners[eventType]?.length > 0) {
          const newListing = generateNewListing();
          this.eventListeners[eventType].forEach((callback) => {
            callback({
              type: "listing_changed",
              data: newListing,
              timestamp: new Date().toISOString(),
            });
          });
        } else {
          clearInterval(interval);
        }
      }, Math.random() * 5000 + 5000);
    }

    if (eventType === "alerts") {
      // Simulate alerts every 15-30 seconds
      const interval = setInterval(() => {
        if (this.eventListeners[eventType]?.length > 0) {
          const alert: Alert = {
            id: `alert-${Date.now()}`,
            userId: "user-demo",
            listingId:
              mockData.listings[
                Math.floor(Math.random() * mockData.listings.length)
              ].id,
            searchId: mockData.savedSearches[0].id,
            resultId: `result-${Date.now()}`,
            score: Math.random() * 0.3 + 0.7, // High scores for demo
            triggeredAt: new Date().toISOString(),
            channels: ["devbrowser"],
            delivered: true,
          };

          this.eventListeners[eventType].forEach((callback) => {
            callback({
              type: "alert_fired",
              data: alert,
              timestamp: new Date().toISOString(),
            });
          });
        } else {
          clearInterval(interval);
        }
      }, Math.random() * 15000 + 15000);
    }

    if (eventType === "system") {
      // Simulate system health updates every 10 seconds
      const interval = setInterval(() => {
        if (this.eventListeners[eventType]?.length > 0) {
          // Randomly update some metrics
          mockData.systemHealth.services.forEach((service) => {
            if (service.metrics) {
              service.metrics.eventsProcessed =
                (service.metrics.eventsProcessed || 0) +
                Math.floor(Math.random() * 10);
              service.lastCheck = new Date().toISOString();
            }
          });

          this.eventListeners[eventType].forEach((callback) => {
            callback({
              type: "system_health_updated",
              data: mockData.systemHealth,
              timestamp: new Date().toISOString(),
            });
          });
        } else {
          clearInterval(interval);
        }
      }, 10000);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.eventListeners = {};
  }
}

// Export singleton instance
export const apiService = APIService.getInstance();
