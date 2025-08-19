import { beforeEach, describe, expect, it } from "vitest";
import { MemoryFactorsRepo } from "../src/adapters/factors.memory";
import { MemorySnapshotRepo, MemoryUWRepo } from "../src/adapters/repo.memory";
import { Assumptions, BaseInputs } from "../src/core/dto";
import {
  batchComputeExact,
  computeExact,
  getCachedExact,
} from "../src/core/exact";

describe("Exact Cache", () => {
  let snapshotRepo: MemorySnapshotRepo;
  let uwRepo: MemoryUWRepo;
  let factorsRepo: MemoryFactorsRepo;
  let mockBaseInputs: BaseInputs;
  let mockAssumptions: Assumptions;

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

    mockAssumptions = {
      downPct: 0.25,
      rateBps: 475, // 4.75%
      amortMonths: 300,
      rentScenario: "P75",
    };

    snapshotRepo.setBaseInputs("test-123", mockBaseInputs);
  });

  describe("computeExact", () => {
    it("should compute exact metrics on first call", async () => {
      const result = await computeExact(
        "test-123",
        mockAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(result.id).toBeDefined();
      expect(result.fromCache).toBe(false);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.price).toBe(1000000);
      expect(result.metrics.noi).toBe(55000); // P75 scenario
      expect(result.metrics.inputs).toEqual(mockAssumptions);
    });

    it("should return cached result on second call", async () => {
      // First call
      const result1 = await computeExact(
        "test-123",
        mockAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      // Second call with identical assumptions
      const result2 = await computeExact(
        "test-123",
        mockAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(result2.id).toBe(result1.id);
      expect(result2.fromCache).toBe(true);
      expect(result2.metrics).toEqual(result1.metrics);
      expect(uwRepo.getExactRowCount()).toBe(1); // Only one row created
    });

    it("should create new cache entry for different assumptions", async () => {
      // First computation
      const result1 = await computeExact(
        "test-123",
        mockAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      // Different assumptions
      const differentAssumptions: Assumptions = {
        ...mockAssumptions,
        downPct: 0.3,
      };

      const result2 = await computeExact(
        "test-123",
        differentAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(result2.id).not.toBe(result1.id);
      expect(result2.fromCache).toBe(false);
      expect(uwRepo.getExactRowCount()).toBe(2);
    });

    it("should handle version changes correctly", async () => {
      // First computation
      const result1 = await computeExact(
        "test-123",
        mockAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      // Update listing version
      const updatedInputs = { ...mockBaseInputs, listingVersion: 2 };
      snapshotRepo.setBaseInputs("test-123", updatedInputs);

      // Same assumptions but new version should miss cache
      const result2 = await computeExact(
        "test-123",
        mockAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(result2.id).not.toBe(result1.id);
      expect(result2.fromCache).toBe(false);
      expect(uwRepo.getExactRowCount()).toBe(2);
    });

    it("should handle missing base inputs", async () => {
      await expect(
        computeExact(
          "nonexistent",
          mockAssumptions,
          snapshotRepo,
          uwRepo,
          factorsRepo
        )
      ).rejects.toThrow("Base inputs not found");
    });

    it("should validate assumptions", async () => {
      const invalidAssumptions: Assumptions = {
        ...mockAssumptions,
        downPct: 0.02, // Below minimum
      };

      await expect(
        computeExact(
          "test-123",
          invalidAssumptions,
          snapshotRepo,
          uwRepo,
          factorsRepo
        )
      ).rejects.toThrow("Down payment percentage");
    });
  });

  describe("getCachedExact", () => {
    beforeEach(async () => {
      // Pre-populate cache
      await computeExact(
        "test-123",
        mockAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );
    });

    it("should retrieve cached result", async () => {
      const cached = await getCachedExact(
        "test-123",
        1,
        mockAssumptions,
        uwRepo
      );

      expect(cached).toBeDefined();
      expect(cached!.id).toBeDefined();
      expect(cached!.metrics.price).toBe(1000000);
    });

    it("should return null for cache miss", async () => {
      const differentAssumptions: Assumptions = {
        ...mockAssumptions,
        downPct: 0.3,
      };

      const cached = await getCachedExact(
        "test-123",
        1,
        differentAssumptions,
        uwRepo
      );
      expect(cached).toBeNull();
    });

    it("should return null for different version", async () => {
      const cached = await getCachedExact(
        "test-123",
        2,
        mockAssumptions,
        uwRepo
      );
      expect(cached).toBeNull();
    });
  });

  describe("batchComputeExact", () => {
    it("should compute multiple assumption sets", async () => {
      const assumptionsSets: Assumptions[] = [
        mockAssumptions,
        { ...mockAssumptions, downPct: 0.2 },
        { ...mockAssumptions, rateBps: 500 },
      ];

      const results = await batchComputeExact(
        "test-123",
        assumptionsSets,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(results).toHaveLength(3);
      expect(results[0].fromCache).toBe(false);
      expect(results[1].fromCache).toBe(false);
      expect(results[2].fromCache).toBe(false);
      expect(uwRepo.getExactRowCount()).toBe(3);

      // Each result should have different metrics due to different assumptions
      expect(results[0].metrics.inputs.downPct).toBe(0.25);
      expect(results[1].metrics.inputs.downPct).toBe(0.2);
      expect(results[2].metrics.inputs.rateBps).toBe(500);
    });

    it("should use cache for duplicate assumptions", async () => {
      const assumptionsSets: Assumptions[] = [
        mockAssumptions,
        mockAssumptions, // Duplicate
        { ...mockAssumptions, downPct: 0.2 },
      ];

      const results = await batchComputeExact(
        "test-123",
        assumptionsSets,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(results).toHaveLength(3);
      expect(results[0].fromCache).toBe(false);
      expect(results[1].fromCache).toBe(true); // Should hit cache
      expect(results[2].fromCache).toBe(false);
      expect(uwRepo.getExactRowCount()).toBe(2); // Only 2 unique rows
    });
  });

  describe("assumptions hashing", () => {
    it("should generate same hash for identical assumptions", async () => {
      const result1 = await computeExact(
        "test-123",
        mockAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      // Create identical assumptions object
      const identicalAssumptions: Assumptions = {
        downPct: 0.25,
        rateBps: 475,
        amortMonths: 300,
        rentScenario: "P75",
      };

      const result2 = await computeExact(
        "test-123",
        identicalAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(result2.fromCache).toBe(true);
      expect(result2.id).toBe(result1.id);
    });

    it("should handle optional fields in hashing", async () => {
      const assumptionsWithOptionals: Assumptions = {
        ...mockAssumptions,
        mgmtPct: 0.05,
        reservesMonthly: 200,
      };

      const result1 = await computeExact(
        "test-123",
        assumptionsWithOptionals,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      // Same assumptions with optionals in different order
      const reorderedAssumptions: Assumptions = {
        downPct: 0.25,
        rateBps: 475,
        amortMonths: 300,
        rentScenario: "P75",
        reservesMonthly: 200,
        mgmtPct: 0.05,
      };

      const result2 = await computeExact(
        "test-123",
        reorderedAssumptions,
        snapshotRepo,
        uwRepo,
        factorsRepo
      );

      expect(result2.fromCache).toBe(true);
      expect(result2.id).toBe(result1.id);
    });
  });
});
