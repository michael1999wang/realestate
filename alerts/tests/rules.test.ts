import { describe, expect, it } from "vitest";
import { ListingSnapshot, SavedSearch, UWMetrics } from "../src/core/dto";
import { filterMatches, thresholdsPass } from "../src/core/rules";

describe("Rules", () => {
  const sampleListing: ListingSnapshot = {
    id: "listing-1",
    city: "Toronto",
    province: "ON",
    propertyType: "Condo",
    beds: 2,
    baths: 2,
    price: 750000,
  };

  const sampleSearch: SavedSearch = {
    id: "search-1",
    userId: "user-123",
    name: "Test Search",
    filter: {
      city: "Toronto",
      province: "ON",
      propertyType: "Condo",
      minBeds: 2,
      maxPrice: 800000,
    },
    thresholds: {
      minDSCR: 1.2,
      minCoC: 0.08,
      requireNonNegativeCF: true,
    },
    notify: { channel: ["devbrowser"] },
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  describe("filterMatches", () => {
    it("should match when all filters pass", () => {
      expect(filterMatches(sampleSearch, sampleListing)).toBe(true);
    });

    it("should not match when city differs", () => {
      const search = {
        ...sampleSearch,
        filter: { ...sampleSearch.filter, city: "Vancouver" },
      };
      expect(filterMatches(search, sampleListing)).toBe(false);
    });

    it("should not match when price exceeds max", () => {
      const search = {
        ...sampleSearch,
        filter: { ...sampleSearch.filter, maxPrice: 700000 },
      };
      expect(filterMatches(search, sampleListing)).toBe(false);
    });

    it("should not match when beds below minimum", () => {
      const search = {
        ...sampleSearch,
        filter: { ...sampleSearch.filter, minBeds: 3 },
      };
      expect(filterMatches(search, sampleListing)).toBe(false);
    });

    it("should match with case-insensitive city", () => {
      const search = {
        ...sampleSearch,
        filter: { ...sampleSearch.filter, city: "toronto" },
      };
      expect(filterMatches(search, sampleListing)).toBe(true);
    });
  });

  describe("thresholdsPass", () => {
    const sampleMetrics: UWMetrics = {
      dscr: 1.35,
      cashOnCashPct: 0.09,
      cashFlowAnnual: 2400,
      capRatePct: 0.045,
      irrPct: 0.12,
    };

    it("should pass when all thresholds met", () => {
      const result = thresholdsPass(sampleSearch, sampleMetrics, undefined);
      expect(result.ok).toBe(true);
      expect(result.matched).toContain("dscr>=1.2");
      expect(result.matched).toContain("coc>=0.08");
      expect(result.matched).toContain("cf>=0");
    });

    it("should fail when DSCR below minimum", () => {
      const metrics = { ...sampleMetrics, dscr: 1.1 };
      const result = thresholdsPass(sampleSearch, metrics, undefined);
      expect(result.ok).toBe(false);
    });

    it("should fail when cash flow negative", () => {
      const metrics = { ...sampleMetrics, cashFlowAnnual: -500 };
      const result = thresholdsPass(sampleSearch, metrics, undefined);
      expect(result.ok).toBe(false);
    });

    it("should pass with score threshold", () => {
      const search = { ...sampleSearch, thresholds: { minScore: 8.0 } };
      const result = thresholdsPass(search, undefined, 8.5);
      expect(result.ok).toBe(true);
      expect(result.matched).toContain("score>=8");
    });

    it("should fail when score below minimum", () => {
      const search = { ...sampleSearch, thresholds: { minScore: 8.0 } };
      const result = thresholdsPass(search, undefined, 7.5);
      expect(result.ok).toBe(false);
    });
  });
});
