/**
 * Versioning utilities for underwriting computations
 */

export interface VersionInfo {
  listingId: string;
  currentVersion: number;
  lastComputedVersion?: number;
  needsRecomputation: boolean;
}

/**
 * Check if a listing needs recomputation based on version
 * @param listingId Listing ID to check
 * @param currentVersion Current listing version
 * @param lastComputedVersion Last version we computed for (if any)
 * @returns Version information with recomputation flag
 */
export function checkVersioning(
  listingId: string,
  currentVersion: number,
  lastComputedVersion?: number
): VersionInfo {
  const needsRecomputation =
    !lastComputedVersion || currentVersion > lastComputedVersion;

  return {
    listingId,
    currentVersion,
    lastComputedVersion,
    needsRecomputation,
  };
}

/**
 * Generate a version-aware cache key
 * @param listingId Listing ID
 * @param version Listing version
 * @param suffix Optional suffix for the key
 * @returns Cache key string
 */
export function versionedCacheKey(
  listingId: string,
  version: number,
  suffix?: string
): string {
  const base = `${listingId}_v${version}`;
  return suffix ? `${base}_${suffix}` : base;
}

/**
 * Parse a versioned cache key back into components
 * @param cacheKey Cache key to parse
 * @returns Parsed components or null if invalid format
 */
export function parseVersionedCacheKey(cacheKey: string): {
  listingId: string;
  version: number;
  suffix?: string;
} | null {
  const match = cacheKey.match(/^(.+)_v(\d+)(?:_(.+))?$/);
  if (!match) return null;

  return {
    listingId: match[1],
    version: parseInt(match[2], 10),
    suffix: match[3],
  };
}
