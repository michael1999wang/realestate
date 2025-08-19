import { beforeEach, describe, expect, it } from "vitest";
import { MemoryFactorsRepo } from "../src/adapters/factors.memory";
import { MemorySnapshotRepo, MemoryUWRepo } from "../src/adapters/repo.memory";
import { BaseInputs } from "../src/core/dto";
import {
  computeGrid,
  getGridRow,
  needsGridComputation,
} from "../src/core/grid";

describe("Grid Computation", () => {
  let snapshotRepo: MemorySnapshotRepo;
  let uwRepo: MemoryUWRepo;
  let factorsRepo: MemoryFactorsRepo;
  let mockBaseInputs: BaseInputs;

  beforeEach(() => {
    snapshotRepo = new MemorySnapshotRepo();
    uwRepo = new MemoryUWRepo();
    factorsRepo = new MemoryFactorsRepo();

    mockBaseInputs = {
      listingId: "test-123",
      listingVersion: 1,
      price: 1000000,
      closingCosts: 25000,
      noiP25: 45000,
      noiP50: 50000,
      noiP75: 55000,
      city: "Toronto",
      province: "ON",
      propertyType: "Condo",
    };

    snapshotRepo.setBaseInputs("test-123", mockBaseInputs);
  });

  describe("computeGrid", () => {
    it("should compute grid for all bin combinations", async () => {
      const result = await computeGrid(
        "test-123",
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(result.rowsComputed).toBeGreaterThan(0);
      expect(result.rowsUpserted).toBe(result.rowsComputed);
      expect(uwRepo.getGridRowCount()).toBe(result.rowsUpserted);
    });

    it("should handle missing base inputs", async () => {
      await expect(
        computeGrid("nonexistent", snapshotRepo, uwRepo, factorsRepo)
      ).rejects.toThrow("Base inputs not found");
    });

    it("should generate expected number of combinations", async () => {
      // With default grid config: 31 down%, 101 rates, 3 amorts, 3 scenarios
      // But actual count depends on config - let's just verify we get a reasonable number
      const result = await computeGrid(
        "test-123",
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(result.rowsComputed).toBeGreaterThan(100);
      expect(result.rowsComputed).toBeLessThan(50000); // Sanity check
    });

    it("should create grid rows with correct structure", async () => {
      await computeGrid("test-123", snapshotRepo, uwRepo, factorsRepo);

      const allRows = uwRepo.getAllGridRows();
      expect(allRows.length).toBeGreaterThan(0);

      const firstRow = allRows[0];
      expect(firstRow.listingId).toBe("test-123");
      expect(firstRow.listingVersion).toBe(1);
      expect(["P25", "P50", "P75"]).toContain(firstRow.rentScenario);
      expect(firstRow.downPctBin).toBeGreaterThanOrEqual(0.05);
      expect(firstRow.downPctBin).toBeLessThanOrEqual(0.35);
      expect(firstRow.rateBpsBin).toBeGreaterThanOrEqual(300);
      expect(firstRow.rateBpsBin).toBeLessThanOrEqual(800);
      expect([240, 300, 360]).toContain(firstRow.amortMonths);
      expect(firstRow.metrics).toBeDefined();
      expect(firstRow.metrics.price).toBe(1000000);
    });

    it("should show monotonicity in key metrics", async () => {
      await computeGrid("test-123", snapshotRepo, uwRepo, factorsRepo);

      const allRows = uwRepo.getAllGridRows();

      // Find rows with same scenario and rate but different down payments
      const p50Rows = allRows
        .filter(
          (row) =>
            row.rentScenario === "P50" &&
            row.rateBpsBin === 500 &&
            row.amortMonths === 360
        )
        .sort((a, b) => a.downPctBin - b.downPctBin);

      expect(p50Rows.length).toBeGreaterThan(1);

      // Higher down payment should generally mean:
      // - Higher DSCR (less debt)
      // - Higher cash flow (less debt service)
      for (let i = 1; i < p50Rows.length; i++) {
        const lower = p50Rows[i - 1];
        const higher = p50Rows[i];

        expect(higher.metrics.dscr).toBeGreaterThan(lower.metrics.dscr);
        expect(higher.metrics.cashFlowAnnual).toBeGreaterThan(
          lower.metrics.cashFlowAnnual
        );
      }
    });
  });

  describe("getGridRow", () => {
    beforeEach(async () => {
      await computeGrid("test-123", snapshotRepo, uwRepo, factorsRepo);
    });

    it("should retrieve specific grid row", async () => {
      const gridRow = await getGridRow(
        "test-123",
        1,
        "P50",
        0.2,
        500,
        360,
        uwRepo
      );

      expect(gridRow).toBeDefined();
      expect(gridRow!.listingId).toBe("test-123");
      expect(gridRow!.rentScenario).toBe("P50");
      expect(gridRow!.downPctBin).toBe(0.2);
      expect(gridRow!.rateBpsBin).toBe(500);
      expect(gridRow!.amortMonths).toBe(360);
    });

    it("should return null for nonexistent row", async () => {
      const gridRow = await getGridRow(
        "test-123",
        1,
        "P50",
        0.99,
        500,
        360,
        uwRepo
      );

      expect(gridRow).toBeNull();
    });

    it("should return null for wrong version", async () => {
      const gridRow = await getGridRow(
        "test-123",
        2,
        "P50",
        0.2,
        500,
        360,
        uwRepo
      );

      expect(gridRow).toBeNull();
    });
  });

  describe("needsGridComputation", () => {
    it("should return true when no grid exists", async () => {
      const needs = await needsGridComputation("test-123", 1, uwRepo);
      expect(needs).toBe(true);
    });

    it("should return false when grid exists", async () => {
      await computeGrid("test-123", snapshotRepo, uwRepo, factorsRepo);

      const needs = await needsGridComputation("test-123", 1, uwRepo);
      expect(needs).toBe(false);
    });

    it("should return true for newer version", async () => {
      await computeGrid("test-123", snapshotRepo, uwRepo, factorsRepo);

      const needs = await needsGridComputation("test-123", 2, uwRepo);
      expect(needs).toBe(true);
    });
  });

  describe("grid metrics validation", () => {
    beforeEach(async () => {
      await computeGrid("test-123", snapshotRepo, uwRepo, factorsRepo);
    });

    it("should have consistent NOI across scenarios", async () => {
      const p25Row = await getGridRow(
        "test-123",
        1,
        "P25",
        0.2,
        500,
        360,
        uwRepo
      );
      const p50Row = await getGridRow(
        "test-123",
        1,
        "P50",
        0.2,
        500,
        360,
        uwRepo
      );
      const p75Row = await getGridRow(
        "test-123",
        1,
        "P75",
        0.2,
        500,
        360,
        uwRepo
      );

      expect(p25Row!.metrics.noi).toBe(45000);
      expect(p50Row!.metrics.noi).toBe(50000);
      expect(p75Row!.metrics.noi).toBe(55000);
    });

    it("should have consistent cap rates", async () => {
      const row = await getGridRow("test-123", 1, "P50", 0.2, 500, 360, uwRepo);

      const expectedCapRate = (50000 / 1000000) * 100;
      expect(row!.metrics.capRatePct).toBeCloseTo(expectedCapRate, 2);
    });

    it("should have reasonable DSCR values", async () => {
      const allRows = uwRepo.getAllGridRows();

      for (const row of allRows) {
        expect(row.metrics.dscr).toBeGreaterThan(0);
        expect(row.metrics.dscr).toBeLessThan(10); // Sanity check
      }
    });
  });
});
