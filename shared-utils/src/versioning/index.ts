/**
 * Shared versioning utilities for microservices
 */

export interface VersionInfo {
  listingId: string;
  currentVersion: number;
  lastComputedVersion?: number;
  needsRecomputation: boolean;
}

export interface ServiceVersionInfo {
  service: string;
  version: string;
  timestamp: string;
}

/**
 * Check if a listing needs recomputation based on version
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

/**
 * Create service version info
 */
export function createServiceVersionInfo(
  serviceName: string,
  version: string = "1.0.0"
): ServiceVersionInfo {
  return {
    service: serviceName,
    version,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a service-specific cache key
 */
export function serviceCacheKey(
  serviceName: string,
  key: string,
  version?: string
): string {
  const base = `${serviceName}:${key}`;
  return version ? `${base}:v${version}` : base;
}

/**
 * Compare semantic versions (simplified)
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }
  
  return 0;
}

/**
 * Check if version is compatible (same major version)
 */
export function isVersionCompatible(v1: string, v2: string): boolean {
  const major1 = parseInt(v1.split('.')[0], 10);
  const major2 = parseInt(v2.split('.')[0], 10);
  
  return major1 === major2;
}
