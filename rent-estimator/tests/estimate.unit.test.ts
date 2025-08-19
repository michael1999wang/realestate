import { beforeEach, describe, expect, it } from "vitest";
import { MemoryBus } from "../src/adapters/bus.memory";
import { MemoryCache } from "../src/adapters/cache.memory";
import { MockCompsSource } from "../src/adapters/comps.source";
import { MockPriorsSource } from "../src/adapters/priors.source";
import { MockReadAdapter } from "../src/adapters/read.mock";
import { MemoryRentRepo } from "../src/adapters/repo.memory";
import { estimateForListing } from "../src/core/estimate";

describe("estimateForListing", () => {
  let deps: {
    read: MockReadAdapter;
    rentRepo: MemoryRentRepo;
    priors: MockPriorsSource;
    comps: MockCompsSource;
    cache: MemoryCache;
    bus: MemoryBus;
  };

  beforeEach(() => {
    deps = {
      read: new MockReadAdapter(),
      rentRepo: new MemoryRentRepo(),
      priors: new MockPriorsSource(),
      comps: new MockCompsSource(),
      cache: new MemoryCache(),
      bus: new MemoryBus(),
    };
  });

  it("should return unchanged when listing not found", async () => {
    const result = await estimateForListing("non-existent", deps);

    expect(result.changed).toBe(false);
    expect(result.estimate).toBeUndefined();
  });

  it("should estimate rent using priors when no comps available", async () => {
    // Clear comps to force priors-only estimation
    deps.comps.clear();

    const result = await estimateForListing("listing-1", deps);

    expect(result.changed).toBe(true);
    expect(result.estimate).toBeDefined();
    expect(result.estimate!.method).toBe("priors");
    expect(result.estimate!.p50).toBe(3400); // From mock priors for M5V:2:Condo (FSA takes precedence)
    expect(result.estimate!.listingId).toBe("listing-1");
    expect(result.estimate!.estimatorVersion).toBe("1.0.0");
  });

  it("should estimate rent using comps when available", async () => {
    const result = await estimateForListing("listing-1", deps);

    expect(result.changed).toBe(true);
    expect(result.estimate).toBeDefined();
    expect(result.estimate!.method).toBe("comps");
    expect(result.estimate!.p50).toBeGreaterThan(2900);
    expect(result.estimate!.p50).toBeLessThan(3500);
    expect(result.estimate!.featuresUsed.comps).toBeDefined();
    expect(result.estimate!.featuresUsed.comps!.length).toBeGreaterThan(0);
  });

  it("should detect material changes and publish events", async () => {
    // First estimation
    const result1 = await estimateForListing("listing-1", deps);
    expect(result1.changed).toBe(true);

    // Second estimation with same data - should not change
    const result2 = await estimateForListing("listing-1", deps);
    expect(result2.changed).toBe(false);

    // Modify comps to create material change
    deps.comps.clear();
    deps.comps.addMockComp({
      id: "new-comp",
      rent: 5000, // Much higher rent
      beds: 2,
      baths: 2,
      sqft: 900,
      lat: 43.6426,
      lng: -79.3871,
      city: "Toronto",
      fsa: "M5V",
      propertyType: "Condo",
      daysOld: 10,
    });

    const result3 = await estimateForListing("listing-1", deps);
    expect(result3.changed).toBe(true);

    // Check that underwrite_requested event was published
    const publishedEvents = deps.bus.getPublishedEvents();
    expect(publishedEvents.length).toBeGreaterThan(0);
    expect(publishedEvents.some((e) => e.type === "underwrite_requested")).toBe(
      true
    );
  });

  it("should cache priors to avoid repeated fetches", async () => {
    // First call should fetch and cache priors
    await estimateForListing("listing-1", deps);

    // Verify cache has priors
    const cacheKey = "rentpriors:M5V:2:Condo";
    const cachedPriors = await deps.cache.get(cacheKey);
    expect(cachedPriors).toBeDefined();

    // Second call should use cached priors
    deps.priors.clear(); // Clear priors source
    const result = await estimateForListing("listing-1", deps);

    expect(result.estimate).toBeDefined();
    expect(result.estimate!.featuresUsed.priors).toBeDefined();
  });

  it("should handle enrichment data correctly", async () => {
    // Add enrichment with rent priors
    deps.read.addEnrichment("listing-1", {
      rentPriors: {
        p25: 2900,
        p50: 3300,
        p75: 3700,
        source: "cmhc",
        asOf: "2024-01-01",
      },
      geo: {
        lat: 43.6426,
        lng: -79.3871,
        fsa: "M5V",
      },
    });

    const result = await estimateForListing("listing-1", deps);

    expect(result.estimate).toBeDefined();
    expect(result.estimate!.featuresUsed.priors).toBeDefined();
    expect(result.estimate!.featuresUsed.priors!.source).toBe("cmhc");
  });

  it("should include all required features in estimate", async () => {
    const result = await estimateForListing("listing-1", deps);

    expect(result.estimate).toBeDefined();
    const estimate = result.estimate!;

    expect(estimate.listingId).toBe("listing-1");
    expect(estimate.listingVersion).toBe(1);
    expect(estimate.estimatorVersion).toBe("1.0.0");
    expect(estimate.method).toMatch(/^(priors|comps|model)$/);
    expect(estimate.p50).toBeGreaterThan(0);
    expect(estimate.computedAt).toBeDefined();
    expect(estimate.featuresUsed).toBeDefined();
    expect(estimate.featuresUsed.beds).toBe(2);
    expect(estimate.featuresUsed.baths).toBe(2);
    expect(estimate.featuresUsed.propertyType).toBe("Condo");
    expect(estimate.featuresUsed.city).toBe("Toronto");
  });

  it("should handle missing geo data gracefully", async () => {
    // Add listing without geo enrichment
    deps.read.addListing({
      id: "listing-no-geo",
      updatedAt: "2024-01-15T10:00:00Z",
      address: {
        city: "Toronto",
        province: "ON",
      },
      beds: 1,
      baths: 1,
      propertyType: "Condo",
    });

    const result = await estimateForListing("listing-no-geo", deps);

    expect(result.changed).toBe(true);
    expect(result.estimate).toBeDefined();
    expect(result.estimate!.method).toBe("priors"); // Should fall back to priors
    expect(result.estimate!.p50).toBe(2500); // From mock priors for Toronto:1:Condo
  });
});
