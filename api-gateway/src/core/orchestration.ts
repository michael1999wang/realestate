/**
 * API Gateway Orchestration Logic
 *
 * This module contains the core orchestration logic that composes data
 * from multiple services without containing any business rules.
 * It handles data aggregation, validation, and coordination.
 */

import {
  Alert,
  PropertyDetailResponse,
  PropertySearchRequest,
  PropertySearchResponse,
  SavedSearch,
  UnderwriteRequest,
  UnderwriteResponse,
  UnderwritingResult,
} from "./dto";

import {
  AlertsReadPort,
  CachePort,
  EnrichmentReadPort,
  ListingReadPort,
  RentEstimateReadPort,
  SavedSearchPort,
  UnderwritingReadPort,
  UnderwritingServicePort,
} from "./ports";

import { Logger } from "@realestate/shared-utils";

export class OrchestrationService {
  constructor(
    private listingsAdapter: ListingReadPort,
    private enrichmentAdapter: EnrichmentReadPort,
    private rentEstimateAdapter: RentEstimateReadPort,
    private underwritingAdapter: UnderwritingReadPort,
    private underwritingService: UnderwritingServicePort,
    private alertsAdapter: AlertsReadPort,
    private savedSearchAdapter: SavedSearchPort,
    private cache: CachePort,
    private logger: Logger
  ) {}

  // ===== Property Search and Details =====

  async searchProperties(
    request: PropertySearchRequest
  ): Promise<PropertySearchResponse> {
    this.logger.info(
      `Searching properties with filters: ${JSON.stringify(request)}`
    );

    try {
      // Validate search parameters
      this.validateSearchRequest(request);

      // Generate cache key
      const cacheKey = this.generateSearchCacheKey(request);

      // Try cache first
      const cached = await this.cache.get<PropertySearchResponse>(cacheKey);
      if (cached) {
        this.logger.debug(`Search cache hit: ${cacheKey}`);
        return cached;
      }

      // Search listings
      const { listings, total } = await this.listingsAdapter.search(request);

      const response: PropertySearchResponse = {
        listings,
        total,
        offset: request.offset || 0,
        limit: request.limit || 50,
      };

      // Cache results for 5 minutes
      await this.cache.set(cacheKey, response, 300);

      this.logger.info(`Found ${listings.length} properties (${total} total)`);
      return response;
    } catch (error) {
      this.logger.error("Property search failed:", error);
      throw error;
    }
  }

  async getPropertyDetail(
    listingId: string,
    userId?: string
  ): Promise<PropertyDetailResponse> {
    this.logger.info(`Getting property detail for ${listingId}`);

    try {
      // Try cache first
      const cacheKey = `property_detail:${listingId}`;
      const cached = await this.cache.get<PropertyDetailResponse>(cacheKey);

      if (cached) {
        this.logger.debug(`Property detail cache hit: ${cacheKey}`);

        // If user is provided, add their specific alerts
        if (userId) {
          const userAlerts = await this.alertsAdapter.findByUserId(userId);
          cached.alerts = userAlerts.filter(
            (alert) => alert.listingId === listingId
          );
        }

        return cached;
      }

      // Fetch data from multiple services in parallel
      const [listing, enrichment, rentEstimate, underwriting, alerts] =
        await Promise.all([
          this.listingsAdapter.findById(listingId),
          this.enrichmentAdapter.findByListingId(listingId),
          this.rentEstimateAdapter.findByListingId(listingId),
          this.underwritingAdapter.findByListingId(listingId),
          userId
            ? this.alertsAdapter.findByUserId(userId)
            : Promise.resolve([]),
        ]);

      if (!listing) {
        throw new Error(`Property ${listingId} not found`);
      }

      const response: PropertyDetailResponse = {
        listing,
        enrichment: enrichment || undefined,
        rentEstimate: rentEstimate || undefined,
        underwriting,
        alerts: alerts.filter((alert) => alert.listingId === listingId),
      };

      // Cache for 10 minutes (shorter than search results due to dynamic data)
      await this.cache.set(cacheKey, response, 600);

      this.logger.info(`Property detail assembled for ${listingId}`);
      return response;
    } catch (error) {
      this.logger.error(`Property detail failed for ${listingId}:`, error);
      throw error;
    }
  }

  async getPropertiesWithAnalysis(
    listingIds: string[]
  ): Promise<PropertyDetailResponse[]> {
    this.logger.info(
      `Getting batch property details for ${listingIds.length} properties`
    );

    if (listingIds.length === 0) return [];
    if (listingIds.length > 50) {
      throw new Error("Maximum 50 properties per batch request");
    }

    try {
      // Fetch all data in parallel
      const [listings, enrichments, rentEstimates, underwritingMap] =
        await Promise.all([
          this.listingsAdapter.findByIds(listingIds),
          this.enrichmentAdapter.findByListingIds(listingIds),
          this.rentEstimateAdapter.findByListingIds(listingIds),
          this.underwritingAdapter.findByListingIds(listingIds),
        ]);

      // Create maps for efficient lookups
      const listingMap = new Map(listings.map((l) => [l.id, l]));
      const enrichmentMap = new Map(enrichments.map((e) => [e.listingId, e]));
      const rentEstimateMap = new Map(
        rentEstimates.map((r) => [r.listingId, r])
      );

      // Assemble responses
      const results: PropertyDetailResponse[] = listingIds.map((listingId) => {
        const listing = listingMap.get(listingId);
        if (!listing) {
          throw new Error(`Property ${listingId} not found`);
        }

        return {
          listing,
          enrichment: enrichmentMap.get(listingId),
          rentEstimate: rentEstimateMap.get(listingId),
          underwriting: underwritingMap.get(listingId) || [],
          alerts: [], // Alerts are user-specific, not included in batch
        };
      });

      this.logger.info(`Assembled ${results.length} property details`);
      return results;
    } catch (error) {
      this.logger.error("Batch property details failed:", error);
      throw error;
    }
  }

  // ===== Underwriting =====

  async triggerUnderwriting(
    request: UnderwriteRequest
  ): Promise<UnderwriteResponse> {
    this.logger.info(`Triggering underwriting for ${request.listingId}`);

    try {
      // Validate the listing exists
      const listing = await this.listingsAdapter.findById(request.listingId);
      if (!listing) {
        throw new Error(`Property ${request.listingId} not found`);
      }

      // Check if we have cached results for this exact request
      if (request.assumptions) {
        const cacheKey = this.generateUnderwritingCacheKey(request);
        const cached = await this.cache.get<UnderwriteResponse>(cacheKey);

        if (cached) {
          this.logger.debug(`Underwriting cache hit: ${cacheKey}`);
          return { ...cached, fromCache: true };
        }
      }

      // Call underwriting service
      const result = await this.underwritingService.computeExact(request);

      // Cache the result for 30 minutes
      if (request.assumptions) {
        const cacheKey = this.generateUnderwritingCacheKey(request);
        await this.cache.set(cacheKey, result, 1800);
      }

      this.logger.info(`Underwriting completed for ${request.listingId}`);
      return result;
    } catch (error) {
      this.logger.error(`Underwriting failed for ${request.listingId}:`, error);
      throw error;
    }
  }

  async getUnderwritingResults(
    listingId: string
  ): Promise<UnderwritingResult[]> {
    this.logger.info(`Getting underwriting results for ${listingId}`);

    try {
      const cacheKey = `underwriting_results:${listingId}`;
      const cached = await this.cache.get<UnderwritingResult[]>(cacheKey);

      if (cached) {
        this.logger.debug(`Underwriting results cache hit: ${cacheKey}`);
        return cached;
      }

      const results = await this.underwritingAdapter.findByListingId(listingId);

      // Cache for 15 minutes
      await this.cache.set(cacheKey, results, 900);

      this.logger.info(
        `Found ${results.length} underwriting results for ${listingId}`
      );
      return results;
    } catch (error) {
      this.logger.error(
        `Getting underwriting results failed for ${listingId}:`,
        error
      );
      throw error;
    }
  }

  // ===== Saved Searches =====

  async getUserSavedSearches(userId: string): Promise<SavedSearch[]> {
    this.logger.info(`Getting saved searches for user ${userId}`);

    try {
      const cacheKey = `saved_searches:${userId}`;
      const cached = await this.cache.get<SavedSearch[]>(cacheKey);

      if (cached) {
        this.logger.debug(`Saved searches cache hit: ${cacheKey}`);
        return cached;
      }

      const searches = await this.savedSearchAdapter.findByUserId(userId);

      // Cache for 10 minutes
      await this.cache.set(cacheKey, searches, 600);

      this.logger.info(
        `Found ${searches.length} saved searches for user ${userId}`
      );
      return searches;
    } catch (error) {
      this.logger.error(
        `Getting saved searches failed for user ${userId}:`,
        error
      );
      throw error;
    }
  }

  async createSavedSearch(
    search: Omit<SavedSearch, "id">
  ): Promise<SavedSearch> {
    this.logger.info(`Creating saved search for user ${search.userId}`);

    try {
      // Validate search parameters
      this.validateSavedSearch(search);

      const result = await this.savedSearchAdapter.create(search);

      // Invalidate user's saved searches cache
      await this.cache.delete(`saved_searches:${search.userId}`);

      this.logger.info(
        `Created saved search ${result.id} for user ${search.userId}`
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Creating saved search failed for user ${search.userId}:`,
        error
      );
      throw error;
    }
  }

  async updateSavedSearch(
    searchId: string,
    updates: Partial<SavedSearch>
  ): Promise<SavedSearch | null> {
    this.logger.info(`Updating saved search ${searchId}`);

    try {
      const result = await this.savedSearchAdapter.update(searchId, updates);

      if (result) {
        // Invalidate user's saved searches cache
        await this.cache.delete(`saved_searches:${result.userId}`);
        this.logger.info(`Updated saved search ${searchId}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Updating saved search ${searchId} failed:`, error);
      throw error;
    }
  }

  async deleteSavedSearch(searchId: string, userId: string): Promise<boolean> {
    this.logger.info(`Deleting saved search ${searchId}`);

    try {
      const result = await this.savedSearchAdapter.delete(searchId);

      if (result) {
        // Invalidate user's saved searches cache
        await this.cache.delete(`saved_searches:${userId}`);
        this.logger.info(`Deleted saved search ${searchId}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Deleting saved search ${searchId} failed:`, error);
      throw error;
    }
  }

  // ===== Alerts =====

  async getUserAlerts(userId: string): Promise<Alert[]> {
    this.logger.info(`Getting alerts for user ${userId}`);

    try {
      const cacheKey = `alerts:${userId}`;
      const cached = await this.cache.get<Alert[]>(cacheKey);

      if (cached) {
        this.logger.debug(`Alerts cache hit: ${cacheKey}`);
        return cached;
      }

      const alerts = await this.alertsAdapter.findByUserId(userId);

      // Cache for 2 minutes (alerts are time-sensitive)
      await this.cache.set(cacheKey, alerts, 120);

      this.logger.info(`Found ${alerts.length} alerts for user ${userId}`);
      return alerts;
    } catch (error) {
      this.logger.error(`Getting alerts failed for user ${userId}:`, error);
      throw error;
    }
  }

  async markAlertAsRead(alertId: string, userId: string): Promise<void> {
    this.logger.info(`Marking alert ${alertId} as read`);

    try {
      await this.alertsAdapter.markAsRead(alertId);

      // Invalidate user's alerts cache
      await this.cache.delete(`alerts:${userId}`);

      this.logger.info(`Marked alert ${alertId} as read`);
    } catch (error) {
      this.logger.error(`Marking alert ${alertId} as read failed:`, error);
      throw error;
    }
  }

  // ===== Validation Helpers =====

  private validateSearchRequest(request: PropertySearchRequest): void {
    if (request.limit && (request.limit < 1 || request.limit > 100)) {
      throw new Error("Limit must be between 1 and 100");
    }

    if (request.offset && request.offset < 0) {
      throw new Error("Offset must be non-negative");
    }

    if (
      request.minPrice &&
      request.maxPrice &&
      request.minPrice > request.maxPrice
    ) {
      throw new Error("Min price cannot be greater than max price");
    }

    if (
      request.minBeds &&
      request.maxBeds &&
      request.minBeds > request.maxBeds
    ) {
      throw new Error("Min beds cannot be greater than max beds");
    }
  }

  private validateSavedSearch(search: Omit<SavedSearch, "id">): void {
    if (!search.name || search.name.trim().length === 0) {
      throw new Error("Search name is required");
    }

    if (search.name.length > 100) {
      throw new Error("Search name cannot exceed 100 characters");
    }

    if (!search.userId) {
      throw new Error("User ID is required");
    }

    // Validate notification channels
    if (search.notify.channel.length === 0) {
      throw new Error("At least one notification channel is required");
    }

    const validChannels = ["devbrowser", "email", "sms", "slack"];
    for (const channel of search.notify.channel) {
      if (!validChannels.includes(channel)) {
        throw new Error(`Invalid notification channel: ${channel}`);
      }
    }
  }

  // ===== Cache Key Generators =====

  private generateSearchCacheKey(request: PropertySearchRequest): string {
    const params = {
      city: request.city,
      province: request.province,
      propertyType: request.propertyType,
      minBeds: request.minBeds,
      maxBeds: request.maxBeds,
      minPrice: request.minPrice,
      maxPrice: request.maxPrice,
      status: request.status,
      limit: request.limit,
      offset: request.offset,
    };

    const filtered = Object.fromEntries(
      Object.entries(params).filter(
        ([_, value]) => value !== undefined && value !== null
      )
    );

    const hash = Buffer.from(JSON.stringify(filtered))
      .toString("base64")
      .replace(/[+/=]/g, "");
    return `search:${hash}`;
  }

  private generateUnderwritingCacheKey(request: UnderwriteRequest): string {
    if (!request.assumptions) {
      return `underwriting:${request.listingId}`;
    }

    const key = `underwriting:${request.listingId}:${request.assumptions.downPct}:${request.assumptions.rateBps}:${request.assumptions.amortMonths}:${request.assumptions.rentScenario}`;
    return key;
  }
}
