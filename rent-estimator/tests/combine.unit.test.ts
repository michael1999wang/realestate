import { describe, expect, it } from "vitest";
import { combineEstimates } from "../src/core/combine";

describe("combineEstimates", () => {
  it("should use priors when no comps available", () => {
    const priors = { p25: 2800, p50: 3200, p75: 3600 };
    const comps: any[] = [];

    const result = combineEstimates({ priors, comps });

    expect(result.method).toBe("priors");
    expect(result.p50).toBe(3200);
    expect(result.p25).toBe(2800);
    expect(result.p75).toBe(3600);
    expect(result.usedComps).toEqual([]);
  });

  it("should throw error when no priors and no comps", () => {
    const priors = null;
    const comps: any[] = [];

    expect(() => combineEstimates({ priors, comps })).toThrow(
      "Cannot estimate rent without comps or priors"
    );
  });

  it("should use comps when available", () => {
    const priors = { p25: 2800, p50: 3200, p75: 3600 };
    const comps = [
      { id: "comp-1", rent: 3100, distanceKm: 0.5, daysOld: 15 },
      { id: "comp-2", rent: 3300, distanceKm: 1.0, daysOld: 25 },
      { id: "comp-3", rent: 2950, distanceKm: 0.8, daysOld: 45 },
      { id: "comp-4", rent: 3400, distanceKm: 1.5, daysOld: 60 },
      { id: "comp-5", rent: 3200, distanceKm: 0.3, daysOld: 30 },
    ];

    const result = combineEstimates({ priors, comps });

    expect(result.method).toBe("comps");
    expect(result.p50).toBeGreaterThan(3000);
    expect(result.p50).toBeLessThan(3400);
    expect(result.usedComps).toHaveLength(5);
    expect(result.stdev).toBeGreaterThan(0);
  });

  it("should blend comps with priors using shrinkage", () => {
    const priors = { p25: 2800, p50: 3200, p75: 3600 };
    const comps = [
      { id: "comp-1", rent: 3500, distanceKm: 0.5, daysOld: 15 },
      { id: "comp-2", rent: 3600, distanceKm: 1.0, daysOld: 25 },
    ];

    const result = combineEstimates({ priors, comps });

    expect(result.method).toBe("comps");
    // With only 2 comps, should blend heavily with priors
    expect(result.p50).toBeGreaterThan(priors.p50!);
    expect(result.p50).toBeLessThan(3600); // Should be less than pure comps median
  });

  it("should weight comps by distance and recency", () => {
    const priors = { p25: 2800, p50: 3200, p75: 3600 };

    // Test with multiple comps to get meaningful weighting
    const compsWithClose = [
      { id: "comp-1", rent: 2500, distanceKm: 0.1, daysOld: 5 }, // Close and recent, low rent
      { id: "comp-2", rent: 3000, distanceKm: 1.0, daysOld: 30 },
      { id: "comp-3", rent: 3500, distanceKm: 2.0, daysOld: 60 },
      { id: "comp-4", rent: 4000, distanceKm: 10.0, daysOld: 180 }, // Far and old, high rent
    ];

    const compsWithFar = [
      { id: "comp-1", rent: 4000, distanceKm: 0.1, daysOld: 5 }, // Close and recent, high rent
      { id: "comp-2", rent: 3500, distanceKm: 1.0, daysOld: 30 },
      { id: "comp-3", rent: 3000, distanceKm: 2.0, daysOld: 60 },
      { id: "comp-4", rent: 2500, distanceKm: 10.0, daysOld: 180 }, // Far and old, low rent
    ];

    const resultWithClose = combineEstimates({ priors, comps: compsWithClose });
    const resultWithFar = combineEstimates({ priors, comps: compsWithFar });

    // The weighted median should be different based on which comp is close/recent
    expect(resultWithClose.p50).not.toBe(resultWithFar.p50);
    expect(resultWithClose.p50).toBeLessThan(resultWithFar.p50); // Close low rent should pull down
  });

  it("should limit used comps to 15", () => {
    const priors = { p25: 2800, p50: 3200, p75: 3600 };
    const comps = Array.from({ length: 20 }, (_, i) => ({
      id: `comp-${i}`,
      rent: 3000 + i * 10,
      distanceKm: 1.0,
      daysOld: 30,
    }));

    const result = combineEstimates({ priors, comps });

    expect(result.usedComps).toHaveLength(15);
  });

  it("should handle comps without distance or age", () => {
    const priors = { p25: 2800, p50: 3200, p75: 3600 };
    const comps = [
      { id: "comp-1", rent: 3100 }, // No distance or age
      { id: "comp-2", rent: 3300, distanceKm: 1.0 }, // No age
      { id: "comp-3", rent: 2950, daysOld: 45 }, // No distance
    ];

    const result = combineEstimates({ priors, comps });

    expect(result.method).toBe("comps");
    expect(result.p50).toBeGreaterThan(3000);
    expect(result.usedComps).toHaveLength(3);
  });
});
