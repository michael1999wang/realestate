import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRentRepo } from "../src/adapters/repo.memory";
import { RentEstimate } from "../src/core/dto";

describe("MemoryRentRepo", () => {
  let repo: MemoryRentRepo;
  let mockEstimate: RentEstimate;

  beforeEach(() => {
    repo = new MemoryRentRepo();
    mockEstimate = {
      listingId: "test-listing-1",
      listingVersion: 1,
      estimatorVersion: "1.0.0",
      method: "comps",
      p25: 2800,
      p50: 3200,
      p75: 3600,
      stdev: 200,
      featuresUsed: {
        beds: 2,
        baths: 2,
        sqft: 900,
        propertyType: "Condo",
        city: "Toronto",
        fsa: "M5V",
        comps: [
          {
            id: "comp-1",
            rent: 3100,
            beds: 2,
            baths: 2,
            sqft: 850,
            distanceKm: 0.5,
            daysOld: 15,
          },
        ],
      },
      computedAt: "2024-01-15T10:00:00Z",
    };
  });

  it("should return null for non-existent listing", async () => {
    const result = await repo.getByListingId("non-existent");
    expect(result).toBeNull();
  });

  it("should insert new estimate and return changed=true", async () => {
    const result = await repo.upsert(mockEstimate);

    expect(result.changed).toBe(true);

    const retrieved = await repo.getByListingId("test-listing-1");
    expect(retrieved).toEqual(mockEstimate);
  });

  it("should update existing estimate and return changed=true when different", async () => {
    // Insert initial estimate
    await repo.upsert(mockEstimate);

    // Update with different p50
    const updatedEstimate = { ...mockEstimate, p50: 3400 };
    const result = await repo.upsert(updatedEstimate);

    expect(result.changed).toBe(true);

    const retrieved = await repo.getByListingId("test-listing-1");
    expect(retrieved?.p50).toBe(3400);
  });

  it("should return changed=false when upserting identical estimate", async () => {
    // Insert initial estimate
    await repo.upsert(mockEstimate);

    // Upsert same estimate again
    const result = await repo.upsert(mockEstimate);

    expect(result.changed).toBe(false);
  });

  it("should handle multiple listings", async () => {
    const estimate1 = { ...mockEstimate, listingId: "listing-1" };
    const estimate2 = { ...mockEstimate, listingId: "listing-2", p50: 3500 };

    await repo.upsert(estimate1);
    await repo.upsert(estimate2);

    expect(repo.size()).toBe(2);

    const retrieved1 = await repo.getByListingId("listing-1");
    const retrieved2 = await repo.getByListingId("listing-2");

    expect(retrieved1?.p50).toBe(3200);
    expect(retrieved2?.p50).toBe(3500);
  });

  it("should clear all estimates", async () => {
    await repo.upsert(mockEstimate);
    expect(repo.size()).toBe(1);

    repo.clear();
    expect(repo.size()).toBe(0);

    const retrieved = await repo.getByListingId("test-listing-1");
    expect(retrieved).toBeNull();
  });

  it("should return all estimates", async () => {
    const estimate1 = { ...mockEstimate, listingId: "listing-1" };
    const estimate2 = { ...mockEstimate, listingId: "listing-2" };

    await repo.upsert(estimate1);
    await repo.upsert(estimate2);

    const all = repo.getAll();
    expect(all).toHaveLength(2);
    expect(all.some((e) => e.listingId === "listing-1")).toBe(true);
    expect(all.some((e) => e.listingId === "listing-2")).toBe(true);
  });

  it("should deep clone estimates to prevent mutation", async () => {
    await repo.upsert(mockEstimate);

    const retrieved = await repo.getByListingId("test-listing-1");
    expect(retrieved).not.toBe(mockEstimate); // Different object references

    // Mutating retrieved should not affect stored estimate
    retrieved!.p50 = 9999;

    const retrievedAgain = await repo.getByListingId("test-listing-1");
    expect(retrievedAgain?.p50).toBe(3200); // Original value preserved
  });
});
