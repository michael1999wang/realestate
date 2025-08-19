import { beforeEach, describe, expect, it } from "vitest";
import { MemoryFactorsRepo } from "../src/adapters/factors.memory";
import {
  MemoryAssumptionsRepo,
  MemorySnapshotRepo,
  MemoryUWRepo,
} from "../src/adapters/repo.memory";
import { Assumptions, BaseInputs, GridRow, Metrics } from "../src/core/dto";

describe("Memory Repository Implementations", () => {
  describe("MemorySnapshotRepo", () => {
    let repo: MemorySnapshotRepo;
    let mockBaseInputs: BaseInputs;

    beforeEach(() => {
      repo = new MemorySnapshotRepo();
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
    });

    it("should store and retrieve base inputs", async () => {
      repo.setBaseInputs("test-123", mockBaseInputs);

      const result = await repo.loadBaseInputs("test-123");
      expect(result).toEqual(mockBaseInputs);
    });

    it("should return null for missing listing", async () => {
      const result = await repo.loadBaseInputs("nonexistent");
      expect(result).toBeNull();
    });

    it("should clear all data", async () => {
      repo.setBaseInputs("test-123", mockBaseInputs);
      repo.clear();

      const result = await repo.loadBaseInputs("test-123");
      expect(result).toBeNull();
    });
  });

  describe("MemoryAssumptionsRepo", () => {
    let repo: MemoryAssumptionsRepo;
    let mockAssumptions: Assumptions;

    beforeEach(() => {
      repo = new MemoryAssumptionsRepo();
      mockAssumptions = {
        downPct: 0.2,
        rateBps: 500,
        amortMonths: 360,
        rentScenario: "P50",
      };
    });

    it("should store and retrieve assumptions by ID", async () => {
      repo.setAssumptions("user-1", mockAssumptions);

      const result = await repo.getAssumptionsById("user-1");
      expect(result).toEqual(mockAssumptions);
    });

    it("should return null for missing assumptions", async () => {
      const result = await repo.getAssumptionsById("nonexistent");
      expect(result).toBeNull();
    });

    it("should return default assumptions", async () => {
      const defaults = await repo.getDefaultAssumptions();

      expect(defaults.downPct).toBe(0.2);
      expect(defaults.rateBps).toBe(500);
      expect(defaults.amortMonths).toBe(360);
      expect(defaults.rentScenario).toBe("P50");
    });

    it("should allow updating default assumptions", async () => {
      const newDefaults: Assumptions = {
        downPct: 0.25,
        rateBps: 450,
        amortMonths: 300,
        rentScenario: "P75",
      };

      repo.setDefaultAssumptions(newDefaults);

      const result = await repo.getDefaultAssumptions();
      expect(result).toEqual(newDefaults);
    });
  });

  describe("MemoryUWRepo", () => {
    let repo: MemoryUWRepo;
    let mockGridRow: GridRow;
    let mockMetrics: Metrics;

    beforeEach(() => {
      repo = new MemoryUWRepo();

      mockMetrics = {
        price: 1000000,
        noi: 50000,
        capRatePct: 5.0,
        loan: 800000,
        dsAnnual: 48000,
        cashFlowAnnual: 2000,
        dscr: 1.04,
        cashOnCashPct: 0.89,
        breakevenOccPct: 96.0,
        inputs: {
          downPct: 0.2,
          rateBps: 500,
          amortMonths: 360,
          rentScenario: "P50",
        },
      };

      mockGridRow = {
        listingId: "test-123",
        listingVersion: 1,
        rentScenario: "P50",
        downPctBin: 0.2,
        rateBpsBin: 500,
        amortMonths: 360,
        metrics: mockMetrics,
      };
    });

    describe("grid operations", () => {
      it("should upsert and retrieve grid rows", async () => {
        await repo.upsertGrid([mockGridRow]);

        const result = await repo.getGridRow(
          "test-123",
          1,
          "P50",
          0.2,
          500,
          360
        );

        expect(result).toEqual(mockGridRow);
        expect(repo.getGridRowCount()).toBe(1);
      });

      it("should handle multiple grid rows", async () => {
        const row2: GridRow = {
          ...mockGridRow,
          downPctBin: 0.25,
        };

        await repo.upsertGrid([mockGridRow, row2]);

        expect(repo.getGridRowCount()).toBe(2);

        const result1 = await repo.getGridRow(
          "test-123",
          1,
          "P50",
          0.2,
          500,
          360
        );
        const result2 = await repo.getGridRow(
          "test-123",
          1,
          "P50",
          0.25,
          500,
          360
        );

        expect(result1?.downPctBin).toBe(0.2);
        expect(result2?.downPctBin).toBe(0.25);
      });

      it("should return null for missing grid row", async () => {
        const result = await repo.getGridRow(
          "nonexistent",
          1,
          "P50",
          0.2,
          500,
          360
        );
        expect(result).toBeNull();
      });

      it("should update existing grid row on upsert", async () => {
        await repo.upsertGrid([mockGridRow]);

        const updatedRow: GridRow = {
          ...mockGridRow,
          metrics: { ...mockMetrics, noi: 55000 },
        };

        await repo.upsertGrid([updatedRow]);

        expect(repo.getGridRowCount()).toBe(1); // Still one row

        const result = await repo.getGridRow(
          "test-123",
          1,
          "P50",
          0.2,
          500,
          360
        );
        expect(result?.metrics.noi).toBe(55000);
      });
    });

    describe("exact cache operations", () => {
      const assumptionsHash = "test-hash-123";

      it("should save and retrieve exact computations", async () => {
        const saveResult = await repo.saveExact(
          "test-123",
          1,
          assumptionsHash,
          mockMetrics
        );

        expect(saveResult.created).toBe(true);
        expect(saveResult.id).toBeDefined();
        expect(repo.getExactRowCount()).toBe(1);

        const getResult = await repo.getExact("test-123", 1, assumptionsHash);
        expect(getResult?.id).toBe(saveResult.id);
        expect(getResult?.metrics).toEqual(mockMetrics);
      });

      it("should not create duplicate exact rows", async () => {
        const result1 = await repo.saveExact(
          "test-123",
          1,
          assumptionsHash,
          mockMetrics
        );

        const result2 = await repo.saveExact(
          "test-123",
          1,
          assumptionsHash,
          mockMetrics
        );

        expect(result1.created).toBe(true);
        expect(result2.created).toBe(false);
        expect(result2.id).toBe(result1.id);
        expect(repo.getExactRowCount()).toBe(1);
      });

      it("should return null for missing exact computation", async () => {
        const result = await repo.getExact("nonexistent", 1, "missing-hash");
        expect(result).toBeNull();
      });

      it("should handle version-specific caching", async () => {
        await repo.saveExact("test-123", 1, assumptionsHash, mockMetrics);
        await repo.saveExact("test-123", 2, assumptionsHash, mockMetrics);

        expect(repo.getExactRowCount()).toBe(2);

        const v1Result = await repo.getExact("test-123", 1, assumptionsHash);
        const v2Result = await repo.getExact("test-123", 2, assumptionsHash);

        expect(v1Result).toBeDefined();
        expect(v2Result).toBeDefined();
        expect(v1Result?.id).not.toBe(v2Result?.id);
      });
    });

    it("should clear all data", () => {
      repo.upsertGrid([mockGridRow]);
      repo.saveExact("test-123", 1, "hash", mockMetrics);

      expect(repo.getGridRowCount()).toBe(1);
      expect(repo.getExactRowCount()).toBe(1);

      repo.clear();

      expect(repo.getGridRowCount()).toBe(0);
      expect(repo.getExactRowCount()).toBe(0);
    });
  });

  describe("MemoryFactorsRepo", () => {
    let repo: MemoryFactorsRepo;

    beforeEach(() => {
      repo = new MemoryFactorsRepo();
    });

    it("should compute and cache annuity factors", async () => {
      const af1 = await repo.getAF(500, 360); // 5%, 30 years
      const af2 = await repo.getAF(500, 360); // Same request

      expect(af1).toBeCloseTo(0.005368, 6);
      expect(af2).toBe(af1); // Should be exact same reference from cache
      expect(repo.getCacheSize()).toBe(1);
    });

    it("should cache different rate/amort combinations", async () => {
      await repo.getAF(500, 360);
      await repo.getAF(600, 360);
      await repo.getAF(500, 300);

      expect(repo.getCacheSize()).toBe(3);
    });

    it("should precompute factors", () => {
      repo.precomputeFactors([400, 500, 600], [300, 360]);

      expect(repo.getCacheSize()).toBe(6); // 3 rates × 2 amorts
    });

    it("should handle zero interest rate", async () => {
      const af = await repo.getAF(0, 360);
      expect(af).toBeCloseTo(1 / 360, 6);
    });

    it("should clear cache", () => {
      repo.getAF(500, 360);
      expect(repo.getCacheSize()).toBe(1);

      repo.clear();
      expect(repo.getCacheSize()).toBe(0);
    });
  });
});
