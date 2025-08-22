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

// API Service Class that makes real HTTP calls to the API Gateway
export class APIService {
  private static instance: APIService;
  private eventSource: EventSource | null = null;
  private eventListeners: { [key: string]: ((data: any) => void)[] } = {};
  private baseURL = "/api/v1"; // API Gateway endpoint

  static getInstance(): APIService {
    if (!APIService.instance) {
      APIService.instance = new APIService();
    }
    return APIService.instance;
  }

  // Generic HTTP request method
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          // In development mode, API Gateway doesn't require auth
          // In production, we'd include: "Authorization": `Bearer ${token}`
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Listings API
  async getListings(): Promise<APIResponse<Listing[]>> {
    const response = await this.request<{
      listings: Listing[];
      total: number;
      offset: number;
      limit: number;
    }>("/properties");

    if (response.success) {
      // Transform API Gateway response to match demo format
      return {
        success: true,
        data: response.data?.listings || [],
        timestamp: response.timestamp,
      };
    }
    return response as APIResponse<Listing[]>;
  }

  async getListing(id: string): Promise<APIResponse<Listing | null>> {
    const response = await this.request<{
      listing: Listing;
      enrichment?: Enrichment;
      rentEstimate?: RentEstimate;
      underwriting: UnderwritingResult[];
      alerts: Alert[];
    }>(`/properties/${id}`);

    if (response.success) {
      return {
        success: true,
        data: response.data?.listing || null,
        timestamp: response.timestamp,
      };
    }
    return response as APIResponse<Listing | null>;
  }

  async getListingWithAnalysis(
    id: string
  ): Promise<APIResponse<ListingWithAnalysis | null>> {
    const response = await this.request<{
      listing: Listing;
      enrichment?: Enrichment;
      rentEstimate?: RentEstimate;
      underwriting: UnderwritingResult[];
      alerts: Alert[];
    }>(`/properties/${id}`);

    if (response.success && response.data) {
      // Transform API Gateway response to demo format
      const analysis: ListingWithAnalysis = {
        listing: response.data.listing,
        enrichment: response.data.enrichment || null,
        rentEstimate: response.data.rentEstimate || null,
        underwriting: response.data.underwriting || [],
        alerts: response.data.alerts || [],
      };

      return {
        success: true,
        data: analysis,
        timestamp: response.timestamp,
      };
    }

    return {
      success: response.success,
      data: null,
      error: response.error,
      timestamp: response.timestamp,
    };
  }

  // Enrichments API (simulated - API Gateway doesn't have a separate enrichments endpoint)
  async getEnrichments(): Promise<APIResponse<Enrichment[]>> {
    // This would require getting listings and extracting enrichments
    // For demo purposes, return empty array
    return {
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    };
  }

  async getEnrichment(
    listingId: string
  ): Promise<APIResponse<Enrichment | null>> {
    const response = await this.getListing(listingId);
    if (response.success) {
      // Get enrichment from full property detail
      const detailResponse = await this.getListingWithAnalysis(listingId);
      if (detailResponse.success) {
        return {
          success: true,
          data: detailResponse.data?.enrichment || null,
          timestamp: detailResponse.timestamp,
        };
      }
    }
    return response as APIResponse<Enrichment | null>;
  }

  // Rent Estimates API (simulated)
  async getRentEstimates(): Promise<APIResponse<RentEstimate[]>> {
    return {
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    };
  }

  async getRentEstimate(
    listingId: string
  ): Promise<APIResponse<RentEstimate | null>> {
    const detailResponse = await this.getListingWithAnalysis(listingId);
    if (detailResponse.success) {
      return {
        success: true,
        data: detailResponse.data?.rentEstimate || null,
        timestamp: detailResponse.timestamp,
      };
    }
    return detailResponse as APIResponse<RentEstimate | null>;
  }

  // Underwriting API
  async getUnderwritingResults(
    listingId?: string
  ): Promise<APIResponse<UnderwritingResult[]>> {
    if (listingId) {
      const response = await this.request<UnderwritingResult[]>(
        `/properties/${listingId}/underwriting`
      );
      return response;
    } else {
      // For all underwriting results, we'd need to implement a separate endpoint
      // For now, return empty array
      return {
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  async requestUnderwriting(
    listingId: string,
    assumptions?: {
      downPct: number;
      rateBps: number;
      amortMonths: number;
      rentScenario: "P25" | "P50" | "P75";
    }
  ): Promise<
    APIResponse<{ jobId: string; resultId: string; fromCache?: boolean }>
  > {
    const response = await this.request<{
      resultId: string;
      metrics: any;
      fromCache?: boolean;
    }>("/underwrite", {
      method: "POST",
      body: JSON.stringify({
        listingId,
        assumptions,
      }),
    });

    if (response.success) {
      return {
        success: true,
        data: {
          jobId: `job-${Date.now()}`,
          resultId: response.data?.resultId || "",
          fromCache: response.data?.fromCache,
        },
        timestamp: response.timestamp,
      };
    }
    return response as APIResponse<{ jobId: string; resultId: string }>;
  }

  // Saved Searches API
  async getSavedSearches(): Promise<APIResponse<SavedSearch[]>> {
    return this.request<SavedSearch[]>("/searches");
  }

  async createSavedSearch(
    search: Omit<SavedSearch, "id">
  ): Promise<APIResponse<SavedSearch>> {
    return this.request<SavedSearch>("/searches", {
      method: "POST",
      body: JSON.stringify(search),
    });
  }

  async updateSavedSearch(
    id: string,
    updates: Partial<SavedSearch>
  ): Promise<APIResponse<SavedSearch>> {
    return this.request<SavedSearch>(`/searches/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteSavedSearch(id: string): Promise<APIResponse<boolean>> {
    const response = await this.request<{ success: boolean }>(
      `/searches/${id}`,
      {
        method: "DELETE",
      }
    );

    if (response.success) {
      return {
        success: true,
        data: response.data?.success || true,
        timestamp: response.timestamp,
      };
    }
    return response as APIResponse<boolean>;
  }

  // Alerts API
  async getAlerts(): Promise<APIResponse<Alert[]>> {
    return this.request<Alert[]>("/alerts");
  }

  async dismissAlert(id: string): Promise<APIResponse<boolean>> {
    const response = await this.request<{ success: boolean }>(
      `/alerts/${id}/read`,
      {
        method: "POST",
      }
    );

    if (response.success) {
      return {
        success: true,
        data: response.data?.success || true,
        timestamp: response.timestamp,
      };
    }
    return response as APIResponse<boolean>;
  }

  // System Health API
  async getSystemHealth(): Promise<APIResponse<SystemHealth>> {
    const response = await this.request<{
      status: "healthy" | "degraded" | "down";
      timestamp: string;
      services: Record<string, any>;
      version: string;
    }>("/system/status");

    if (response.success && response.data) {
      // Transform API Gateway system status to demo format
      const systemHealth: SystemHealth = {
        overallStatus: response.data.status,
        services: Object.entries(response.data.services).map(
          ([name, service]) => ({
            name,
            status: service.status,
            responseTime: service.responseTime || 0,
            lastCheck: service.lastCheck || response.data.timestamp,
            metrics: {
              eventsProcessed: Math.floor(Math.random() * 1000), // Demo data
              eventsReceived: Math.floor(Math.random() * 1100),
              errors: Math.floor(Math.random() * 10),
            },
          })
        ),
        lastUpdated: response.data.timestamp,
      };

      return {
        success: true,
        data: systemHealth,
        timestamp: response.timestamp,
      };
    }

    return response as APIResponse<SystemHealth>;
  }

  // Real-time Events API (Server-Sent Events)
  subscribeToEvents(eventType: string, callback: (data: any) => void) {
    if (!this.eventListeners[eventType]) {
      this.eventListeners[eventType] = [];
    }
    this.eventListeners[eventType].push(callback);

    // Try to connect to real SSE endpoint from API Gateway
    this.connectToSSE();

    // Also start simulation for demo purposes since API Gateway might not have all events
    this.startEventSimulation(eventType);
  }

  unsubscribeFromEvents(eventType: string, callback: (data: any) => void) {
    if (this.eventListeners[eventType]) {
      this.eventListeners[eventType] = this.eventListeners[eventType].filter(
        (cb) => cb !== callback
      );
    }
  }

  private connectToSSE() {
    if (this.eventSource) return;

    try {
      this.eventSource = new EventSource("/sse/events");

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.type;

          // Map API Gateway events to demo events
          if (this.eventListeners[eventType]) {
            this.eventListeners[eventType].forEach((callback) => {
              callback(data);
            });
          }
        } catch (error) {
          console.error("Error parsing SSE event:", error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        // Reconnect after a delay
        setTimeout(() => {
          this.eventSource?.close();
          this.eventSource = null;
          this.connectToSSE();
        }, 5000);
      };
    } catch (error) {
      console.error("Failed to connect to SSE:", error);
    }
  }

  private startEventSimulation(eventType: string) {
    // Keep simulation for demo purposes in case API Gateway doesn't generate enough events
    if (eventType === "listings") {
      const interval = setInterval(() => {
        if (this.eventListeners[eventType]?.length > 0) {
          // Simulate new listing event
          this.eventListeners[eventType].forEach((callback) => {
            callback({
              type: "listing_changed",
              data: {
                id: `demo-listing-${Date.now()}`,
                change: "create",
                timestamp: new Date().toISOString(),
              },
              timestamp: new Date().toISOString(),
            });
          });
        } else {
          clearInterval(interval);
        }
      }, Math.random() * 10000 + 10000); // Every 10-20 seconds
    }

    if (eventType === "alerts") {
      const interval = setInterval(() => {
        if (this.eventListeners[eventType]?.length > 0) {
          this.eventListeners[eventType].forEach((callback) => {
            callback({
              type: "alert_fired",
              data: {
                id: `demo-alert-${Date.now()}`,
                userId: "demo-user",
                listingId: `demo-listing-${Date.now()}`,
                score: Math.random() * 0.3 + 0.7,
                triggeredAt: new Date().toISOString(),
              },
              timestamp: new Date().toISOString(),
            });
          });
        } else {
          clearInterval(interval);
        }
      }, Math.random() * 20000 + 20000); // Every 20-40 seconds
    }

    if (eventType === "system") {
      const interval = setInterval(() => {
        if (this.eventListeners[eventType]?.length > 0) {
          this.eventListeners[eventType].forEach((callback) => {
            callback({
              type: "system_health_updated",
              data: {
                timestamp: new Date().toISOString(),
                overallStatus: "healthy",
              },
              timestamp: new Date().toISOString(),
            });
          });
        } else {
          clearInterval(interval);
        }
      }, 15000); // Every 15 seconds
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
