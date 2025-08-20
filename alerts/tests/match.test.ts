import { describe, expect, it } from "vitest";
import { ListingSnapshot, SavedSearch, UWMetrics } from "../src/core/dto";
import { matchSearches } from "../src/core/match";

describe("Match", () => {
  const sampleListing: ListingSnapshot = {
    id: "listing-1",
    city: "Toronto",
    province: "ON",
    propertyType: "Condo",
    beds: 2,
    baths: 2,
    price: 750000,
  };

  const sampleMetrics: UWMetrics = {
    dscr: 1.35,
    cashOnCashPct: 0.09,
    cashFlowAnnual: 2400,
    capRatePct: 0.045,
    irrPct: 0.12,
  };

  const searches: SavedSearch[] = [
    {
      id: "search-1",
      userId: "user-123",
      name: "Toronto Condos",
      filter: { city: "Toronto", propertyType: "Condo", maxPrice: 800000 },
      thresholds: { minDSCR: 1.2, minCoC: 0.08 },
      notify: { channel: ["devbrowser"] },
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "search-2",
      userId: "user-456",
      name: "Vancouver Houses",
      filter: { city: "Vancouver", propertyType: "House" },
      thresholds: { minDSCR: 1.0 },
      notify: { channel: ["email"] },
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "search-3",
      userId: "user-789",
      name: "Inactive Search",
      filter: { city: "Toronto", propertyType: "Condo" },
      thresholds: { minDSCR: 1.0 },
      notify: { channel: ["devbrowser"] },
      isActive: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: "search-4",
      userId: "user-999",
      name: "High DSCR Required",
      filter: { city: "Toronto", propertyType: "Condo" },
      thresholds: { minDSCR: 2.0 },
      notify: { channel: ["devbrowser"] },
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  it("should match only qualifying searches", () => {
    const winners = matchSearches(sampleListing, searches, sampleMetrics);

    expect(winners).toHaveLength(1);
    expect(winners[0].search.id).toBe("search-1");
    expect(winners[0].matched).toContain("dscr>=1.2");
    expect(winners[0].matched).toContain("coc>=0.08");
  });

  it("should not match inactive searches", () => {
    const winners = matchSearches(sampleListing, searches, sampleMetrics);

    expect(winners.find((w) => w.search.id === "search-3")).toBeUndefined();
  });

  it("should not match searches with different filters", () => {
    const winners = matchSearches(sampleListing, searches, sampleMetrics);

    expect(winners.find((w) => w.search.id === "search-2")).toBeUndefined();
  });

  it("should not match searches with unmet thresholds", () => {
    const winners = matchSearches(sampleListing, searches, sampleMetrics);

    expect(winners.find((w) => w.search.id === "search-4")).toBeUndefined();
  });

  it("should work with score-only matching", () => {
    const scoreSearch: SavedSearch = {
      id: "score-search",
      userId: "user-score",
      name: "Score Based",
      filter: { city: "Toronto", propertyType: "Condo" },
      thresholds: { minScore: 8.0 },
      notify: { channel: ["devbrowser"] },
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const winners = matchSearches(sampleListing, [scoreSearch], undefined, 8.5);

    expect(winners).toHaveLength(1);
    expect(winners[0].matched).toContain("score>=8");
  });
});
