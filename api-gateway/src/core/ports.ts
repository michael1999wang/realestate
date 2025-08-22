/**
 * API Gateway Port Definitions
 *
 * These interfaces define how the API Gateway interacts with other services
 * and external systems without embedding business logic.
 */

import {
  Alert,
  Enrichment,
  Listing,
  PropertySearchRequest,
  RentEstimate,
  SavedSearch,
  UnderwriteRequest,
  UnderwriteResponse,
  UnderwritingResult,
  User,
} from "./dto";

// ===== Data Access Ports =====

/**
 * Read adapter for Ingestor service data
 */
export interface ListingReadPort {
  findById(id: string): Promise<Listing | null>;
  search(
    filters: PropertySearchRequest
  ): Promise<{ listings: Listing[]; total: number }>;
  findByIds(ids: string[]): Promise<Listing[]>;
}

/**
 * Read adapter for Enrichment service data
 */
export interface EnrichmentReadPort {
  findByListingId(listingId: string): Promise<Enrichment | null>;
  findByListingIds(listingIds: string[]): Promise<Enrichment[]>;
}

/**
 * Read adapter for Rent Estimator service data
 */
export interface RentEstimateReadPort {
  findByListingId(listingId: string): Promise<RentEstimate | null>;
  findByListingIds(listingIds: string[]): Promise<RentEstimate[]>;
}

/**
 * Read adapter for Underwriting service data
 */
export interface UnderwritingReadPort {
  findByListingId(listingId: string): Promise<UnderwritingResult[]>;
  findByListingIds(
    listingIds: string[]
  ): Promise<Map<string, UnderwritingResult[]>>;
  getGridResult(
    listingId: string,
    rentScenario: "P25" | "P50" | "P75",
    downPct: number,
    rateBps: number,
    amortMonths: number
  ): Promise<UnderwritingResult | null>;
}

/**
 * Read/Write adapter for Alerts service data
 */
export interface AlertsReadPort {
  findByUserId(userId: string): Promise<Alert[]>;
  findByListingId(listingId: string): Promise<Alert[]>;
  markAsRead(alertId: string): Promise<void>;
}

export interface SavedSearchPort {
  findByUserId(userId: string): Promise<SavedSearch[]>;
  findById(searchId: string): Promise<SavedSearch | null>;
  create(search: Omit<SavedSearch, "id">): Promise<SavedSearch>;
  update(
    searchId: string,
    updates: Partial<SavedSearch>
  ): Promise<SavedSearch | null>;
  delete(searchId: string): Promise<boolean>;
}

// ===== Service Integration Ports =====

/**
 * Underwriting service client for synchronous computation
 */
export interface UnderwritingServicePort {
  computeExact(request: UnderwriteRequest): Promise<UnderwriteResponse>;
  computeGrid(
    listingId: string,
    rentScenario: "P25" | "P50" | "P75"
  ): Promise<UnderwritingResult[]>;
  healthCheck(): Promise<boolean>;
}

// ===== Authentication & Authorization Ports =====

export interface AuthenticationPort {
  authenticate(token: string): Promise<User | null>;
  login(
    email: string,
    password: string
  ): Promise<{ user: User; token: string } | null>;
  refreshToken(token: string): Promise<string | null>;
  validateApiKey(apiKey: string): Promise<User | null>;
}

export interface AuthorizationPort {
  canAccessResource(
    user: User,
    resource: string,
    action: string
  ): Promise<boolean>;
  getRateLimit(user: User): Promise<{ requests: number; windowMs: number }>;
  checkQuota(user: User): Promise<boolean>;
}

// ===== Caching Port =====

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
}

// ===== Rate Limiting Port =====

export interface RateLimitPort {
  isAllowed(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }>;
  getRemainingQuota(identifier: string): Promise<number>;
}

// ===== Health Check Port =====

export interface HealthCheckPort {
  checkServiceHealth(serviceName: string): Promise<{
    healthy: boolean;
    responseTime: number;
    error?: string;
  }>;

  checkDatabaseHealth(): Promise<boolean>;
  checkCacheHealth(): Promise<boolean>;
}
