import * as crypto from "crypto";
import { Assumptions, Metrics } from "./dto";
import { computeMetrics, validateAssumptions } from "./finance";
import { FactorsPort, SnapshotReadPort, UWRepoPort } from "./ports";

export interface ExactComputeResult {
  id: string;
  metrics: Metrics;
  fromCache: boolean;
}

/**
 * Compute exact metrics for a listing with specific assumptions
 * Uses caching based on listing version and assumptions hash
 * @param listingId The listing to compute for
 * @param assumptions Specific investment assumptions
 * @param snapshotRepo Repository for reading base inputs
 * @param uwRepo Repository for caching exact results
 * @param factorsRepo Repository for mortgage factors
 * @returns Result with ID, metrics, and cache hit indicator
 */
export async function computeExact(
  listingId: string,
  assumptions: Assumptions,
  snapshotRepo: SnapshotReadPort,
  uwRepo: UWRepoPort,
  factorsRepo: FactorsPort
): Promise<ExactComputeResult> {
  // Load base inputs for the listing
  const baseInputs = await snapshotRepo.loadBaseInputs(listingId);
  if (!baseInputs) {
    throw new Error(`Base inputs not found for listing ${listingId}`);
  }

  // Validate assumptions
  validateAssumptions(assumptions);

  // Generate stable hash of assumptions
  const assumptionsHash = hashAssumptions(assumptions);

  // Check if we already have this exact computation cached
  const cached = await uwRepo.getExact(
    listingId,
    baseInputs.listingVersion,
    assumptionsHash
  );

  if (cached) {
    return {
      id: cached.id,
      metrics: cached.metrics,
      fromCache: true,
    };
  }

  // Not in cache, compute fresh
  const af = await factorsRepo.getAF(
    assumptions.rateBps,
    assumptions.amortMonths
  );
  const metrics = computeMetrics(baseInputs, assumptions, af);

  // Save to cache
  const saveResult = await uwRepo.saveExact(
    listingId,
    baseInputs.listingVersion,
    assumptionsHash,
    metrics
  );

  return {
    id: saveResult.id,
    metrics,
    fromCache: false,
  };
}

/**
 * Generate a stable hash of assumptions for caching
 * Uses SHA-1 of canonical JSON representation
 * @param assumptions Investment assumptions to hash
 * @returns Hex string hash
 */
function hashAssumptions(assumptions: Assumptions): string {
  // Create a canonical representation by sorting keys and handling optional fields
  const canonical = {
    downPct: assumptions.downPct,
    rateBps: assumptions.rateBps,
    amortMonths: assumptions.amortMonths,
    rentScenario: assumptions.rentScenario,
    // Optional fields - only include if present
    ...(assumptions.mgmtPct !== undefined && { mgmtPct: assumptions.mgmtPct }),
    ...(assumptions.reservesMonthly !== undefined && {
      reservesMonthly: assumptions.reservesMonthly,
    }),
    ...(assumptions.exitCapPct !== undefined && {
      exitCapPct: assumptions.exitCapPct,
    }),
    ...(assumptions.growthRentPct !== undefined && {
      growthRentPct: assumptions.growthRentPct,
    }),
    ...(assumptions.growthExpensePct !== undefined && {
      growthExpensePct: assumptions.growthExpensePct,
    }),
    ...(assumptions.holdYears !== undefined && {
      holdYears: assumptions.holdYears,
    }),
  };

  // Convert to stable JSON string
  const jsonString = JSON.stringify(canonical, Object.keys(canonical).sort());

  // Generate SHA-1 hash
  return crypto.createHash("sha1").update(jsonString).digest("hex");
}

/**
 * Get cached exact computation if it exists
 * @param listingId Listing ID
 * @param listingVersion Listing version
 * @param assumptions Investment assumptions
 * @param uwRepo Repository for reading cached data
 * @returns Cached result if found, null otherwise
 */
export async function getCachedExact(
  listingId: string,
  listingVersion: number,
  assumptions: Assumptions,
  uwRepo: UWRepoPort
): Promise<{ id: string; metrics: Metrics } | null> {
  const assumptionsHash = hashAssumptions(assumptions);
  return uwRepo.getExact(listingId, listingVersion, assumptionsHash);
}

/**
 * Compute exact metrics from assumptions ID
 * Loads assumptions from the assumptions repository first
 * @param listingId The listing to compute for
 * @param assumptionsId ID of stored assumptions
 * @param snapshotRepo Repository for reading base inputs
 * @param assumptionsRepo Repository for reading assumptions
 * @param uwRepo Repository for caching exact results
 * @param factorsRepo Repository for mortgage factors
 * @returns Result with ID, metrics, and cache hit indicator
 */
export async function computeExactFromId(
  listingId: string,
  assumptionsId: string,
  snapshotRepo: SnapshotReadPort,
  assumptionsRepo: {
    getAssumptionsById(id: string): Promise<Assumptions | null>;
  },
  uwRepo: UWRepoPort,
  factorsRepo: FactorsPort
): Promise<ExactComputeResult> {
  // Load assumptions by ID
  const assumptions = await assumptionsRepo.getAssumptionsById(assumptionsId);
  if (!assumptions) {
    throw new Error(`Assumptions not found for ID ${assumptionsId}`);
  }

  // Delegate to main compute function
  return computeExact(
    listingId,
    assumptions,
    snapshotRepo,
    uwRepo,
    factorsRepo
  );
}

/**
 * Invalidate exact cache for a listing
 * This is called when listing version changes
 * @param listingId Listing ID to invalidate
 * @param oldVersion Old listing version (to clean up)
 * @param uwRepo Repository for cache management
 */
export async function invalidateExactCache(
  listingId: string,
  oldVersion: number,
  uwRepo: UWRepoPort
): Promise<void> {
  // In practice, you might want to clean up old cached entries
  // For now, we rely on the version-based cache key to naturally invalidate
  console.log(
    `Exact cache naturally invalidated for ${listingId} version ${oldVersion}`
  );
}

/**
 * Batch compute exact metrics for multiple assumption sets
 * Useful for computing multiple scenarios efficiently
 * @param listingId The listing to compute for
 * @param assumptionsSets Array of assumption sets to compute
 * @param snapshotRepo Repository for reading base inputs
 * @param uwRepo Repository for caching exact results
 * @param factorsRepo Repository for mortgage factors
 * @returns Array of results in same order as input
 */
export async function batchComputeExact(
  listingId: string,
  assumptionsSets: Assumptions[],
  snapshotRepo: SnapshotReadPort,
  uwRepo: UWRepoPort,
  factorsRepo: FactorsPort
): Promise<ExactComputeResult[]> {
  // Load base inputs once
  const baseInputs = await snapshotRepo.loadBaseInputs(listingId);
  if (!baseInputs) {
    throw new Error(`Base inputs not found for listing ${listingId}`);
  }

  // Pre-fetch all needed annuity factors
  const uniqueFactors = new Map<string, number>();
  for (const assumptions of assumptionsSets) {
    const key = `${assumptions.rateBps}-${assumptions.amortMonths}`;
    if (!uniqueFactors.has(key)) {
      const af = await factorsRepo.getAF(
        assumptions.rateBps,
        assumptions.amortMonths
      );
      uniqueFactors.set(key, af);
    }
  }

  // Compute all scenarios
  const results: ExactComputeResult[] = [];
  for (const assumptions of assumptionsSets) {
    try {
      const result = await computeExact(
        listingId,
        assumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );
      results.push(result);
    } catch (error) {
      console.warn(
        `Failed to compute exact for ${listingId}`,
        assumptions,
        error
      );
      // You might want to push a null or error result instead
      throw error;
    }
  }

  return results;
}
