import { beforeEach, describe, expect, it } from "vitest";
import { MemoryEnrichmentRepo } from "../src/adapters/repo.memory";
import { Enrichment } from "../src/core/dto";

describe("MemoryEnrichmentRepo", () => {
  let repo: MemoryEnrichmentRepo;

  beforeEach(() => {
    repo = new MemoryEnrichmentRepo();
  });

  it("should return null for non-existent listing", async () => {
    const result = await repo.getByListingId("non-existent");
    expect(result).toBeNull();
  });

  it("should upsert and retrieve enrichment", async () => {
    const enrichment: Enrichment = {
      listingId: "test-1",
      listingVersion: 1,
      enrichmentVersion: "1.0.0",
      geo: {
        lat: 43.6532,
        lng: -79.3832,
        fsa: "M5V",
        source: "listing",
      },
      taxes: {
        annualEstimate: 5000,
        method: "exact",
      },
      fees: {
        condoFeeMonthly: 400,
      },
      rentPriors: {
        p25: 1800,
        p50: 2200,
        p75: 2800,
        source: "cmhc",
        metro: "Toronto",
        fsa: "M5V",
      },
      locationScores: {
        walk: 85,
        transit: 90,
        bike: 75,
        provider: "walkscore",
      },
      costRules: {
        lttRule: "toronto_double",
        insuranceMonthlyEstimate: 60,
      },
      computedAt: "2024-01-01T00:00:00Z",
    };

    // First upsert should indicate change
    const upsertResult1 = await repo.upsert(enrichment);
    expect(upsertResult1.changed).toBe(true);

    // Should be able to retrieve it
    const retrieved = await repo.getByListingId("test-1");
    expect(retrieved).toEqual(enrichment);

    // Second upsert with same data should not indicate change
    const upsertResult2 = await repo.upsert(enrichment);
    expect(upsertResult2.changed).toBe(false);
  });

  it("should detect changes when upserting modified enrichment", async () => {
    const enrichment1: Enrichment = {
      listingId: "test-2",
      listingVersion: 1,
      enrichmentVersion: "1.0.0",
      taxes: {
        annualEstimate: 5000,
        method: "exact",
      },
      computedAt: "2024-01-01T00:00:00Z",
    };

    const enrichment2: Enrichment = {
      ...enrichment1,
      taxes: {
        annualEstimate: 6000, // Changed
        method: "exact",
      },
      computedAt: "2024-01-01T01:00:00Z", // Different time
    };

    // First upsert
    const result1 = await repo.upsert(enrichment1);
    expect(result1.changed).toBe(true);

    // Second upsert with changes
    const result2 = await repo.upsert(enrichment2);
    expect(result2.changed).toBe(true);

    // Verify the updated data
    const retrieved = await repo.getByListingId("test-2");
    expect(retrieved?.taxes?.annualEstimate).toBe(6000);
  });

  it("should handle multiple listings", async () => {
    const enrichment1: Enrichment = {
      listingId: "test-3",
      listingVersion: 1,
      enrichmentVersion: "1.0.0",
      computedAt: "2024-01-01T00:00:00Z",
    };

    const enrichment2: Enrichment = {
      listingId: "test-4",
      listingVersion: 1,
      enrichmentVersion: "1.0.0",
      computedAt: "2024-01-01T00:00:00Z",
    };

    await repo.upsert(enrichment1);
    await repo.upsert(enrichment2);

    expect(repo.size()).toBe(2);

    const retrieved1 = await repo.getByListingId("test-3");
    const retrieved2 = await repo.getByListingId("test-4");

    expect(retrieved1?.listingId).toBe("test-3");
    expect(retrieved2?.listingId).toBe("test-4");

    const all = repo.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.listingId).sort()).toEqual(["test-3", "test-4"]);
  });

  it("should clear all data", async () => {
    const enrichment: Enrichment = {
      listingId: "test-5",
      listingVersion: 1,
      enrichmentVersion: "1.0.0",
      computedAt: "2024-01-01T00:00:00Z",
    };

    await repo.upsert(enrichment);
    expect(repo.size()).toBe(1);

    repo.clear();
    expect(repo.size()).toBe(0);

    const retrieved = await repo.getByListingId("test-5");
    expect(retrieved).toBeNull();
  });
});
