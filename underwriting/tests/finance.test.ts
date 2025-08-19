import { describe, expect, it } from "vitest";
import { Assumptions, BaseInputs } from "../src/core/dto";
import {
  annuityFactor,
  computeMetrics,
  paymentFromAF,
  validateAssumptions,
} from "../src/core/finance";

describe("Finance Calculations", () => {
  describe("annuityFactor", () => {
    it("should calculate correct annuity factor for 5% 30-year mortgage", () => {
      // 5% = 500 bps, 30 years = 360 months
      const af = annuityFactor(500, 360);
      // Known value for 5% 30-year mortgage
      expect(af).toBeCloseTo(0.005368, 6);
    });

    it("should calculate correct annuity factor for 6% 25-year mortgage", () => {
      // 6% = 600 bps, 25 years = 300 months
      const af = annuityFactor(600, 300);
      expect(af).toBeCloseTo(0.006443, 6);
    });

    it("should handle 0% interest rate", () => {
      const af = annuityFactor(0, 360);
      expect(af).toBeCloseTo(1 / 360, 6);
    });

    it("should calculate correct factor for 20-year mortgage", () => {
      // 4.5% = 450 bps, 20 years = 240 months
      const af = annuityFactor(450, 240);
      expect(af).toBeCloseTo(0.006326, 6);
    });
  });

  describe("paymentFromAF", () => {
    it("should calculate correct monthly payment", () => {
      const loan = 800000; // $800k loan
      const af = 0.005368; // 5% 30-year
      const payment = paymentFromAF(loan, af);
      expect(payment).toBeCloseTo(4294.4, 2);
    });

    it("should handle zero loan", () => {
      const payment = paymentFromAF(0, 0.005368);
      expect(payment).toBe(0);
    });
  });

  describe("computeMetrics", () => {
    const mockBaseInputs: BaseInputs = {
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

    const mockAssumptions: Assumptions = {
      downPct: 0.2,
      rateBps: 500, // 5%
      amortMonths: 360,
      rentScenario: "P50",
    };

    it("should compute correct metrics for standard scenario", () => {
      const af = annuityFactor(500, 360);
      const metrics = computeMetrics(mockBaseInputs, mockAssumptions, af);

      expect(metrics.price).toBe(1000000);
      expect(metrics.noi).toBe(50000); // P50 scenario
      expect(metrics.loan).toBe(800000); // 80% of price
      expect(metrics.capRatePct).toBeCloseTo(5.0, 1); // 50k/1M * 100
      expect(metrics.dsAnnual).toBeCloseTo(51535, 0); // 12 * monthly payment
      expect(metrics.cashFlowAnnual).toBeCloseTo(-1535, 0); // NOI - DS
      expect(metrics.dscr).toBeCloseTo(0.97, 2); // NOI / DS

      const totalCash = 200000 + 25000; // down + closing
      expect(metrics.cashOnCashPct).toBeCloseTo(-0.68, 2); // CF / total cash * 100
    });

    it("should handle P25 rent scenario", () => {
      const assumptions = { ...mockAssumptions, rentScenario: "P25" as const };
      const af = annuityFactor(500, 360);
      const metrics = computeMetrics(mockBaseInputs, assumptions, af);

      expect(metrics.noi).toBe(45000);
      expect(metrics.capRatePct).toBeCloseTo(4.5, 1);
    });

    it("should handle P75 rent scenario", () => {
      const assumptions = { ...mockAssumptions, rentScenario: "P75" as const };
      const af = annuityFactor(500, 360);
      const metrics = computeMetrics(mockBaseInputs, assumptions, af);

      expect(metrics.noi).toBe(55000);
      expect(metrics.capRatePct).toBeCloseTo(5.5, 1);
    });

    it("should apply management percentage", () => {
      const assumptions = { ...mockAssumptions, mgmtPct: 0.1 }; // 10% management
      const af = annuityFactor(500, 360);
      const metrics = computeMetrics(mockBaseInputs, assumptions, af);

      expect(metrics.noi).toBe(45000); // 50k * (1 - 0.1)
    });

    it("should apply monthly reserves", () => {
      const assumptions = { ...mockAssumptions, reservesMonthly: 500 };
      const af = annuityFactor(500, 360);
      const metrics = computeMetrics(mockBaseInputs, assumptions, af);

      expect(metrics.noi).toBe(44000); // 50k - (500 * 12)
    });

    it("should handle high down payment scenario", () => {
      const assumptions = { ...mockAssumptions, downPct: 0.35 }; // 35% down
      const af = annuityFactor(500, 360);
      const metrics = computeMetrics(mockBaseInputs, assumptions, af);

      expect(metrics.loan).toBe(650000); // 65% of price
      expect(metrics.dscr).toBeGreaterThan(1.0); // Better DSCR with less debt
      expect(metrics.cashFlowAnnual).toBeGreaterThan(0); // Positive cash flow
    });
  });

  describe("validateAssumptions", () => {
    const validAssumptions: Assumptions = {
      downPct: 0.2,
      rateBps: 500,
      amortMonths: 360,
      rentScenario: "P50",
    };

    it("should pass validation for valid assumptions", () => {
      expect(() => validateAssumptions(validAssumptions)).not.toThrow();
    });

    it("should reject down payment below 5%", () => {
      const invalid = { ...validAssumptions, downPct: 0.04 };
      expect(() => validateAssumptions(invalid)).toThrow(
        "Down payment percentage"
      );
    });

    it("should reject down payment above 35%", () => {
      const invalid = { ...validAssumptions, downPct: 0.4 };
      expect(() => validateAssumptions(invalid)).toThrow(
        "Down payment percentage"
      );
    });

    it("should reject interest rate below 1%", () => {
      const invalid = { ...validAssumptions, rateBps: 50 };
      expect(() => validateAssumptions(invalid)).toThrow("Interest rate");
    });

    it("should reject interest rate above 20%", () => {
      const invalid = { ...validAssumptions, rateBps: 2500 };
      expect(() => validateAssumptions(invalid)).toThrow("Interest rate");
    });

    it("should reject invalid amortization period", () => {
      const invalid = { ...validAssumptions, amortMonths: 480 };
      expect(() => validateAssumptions(invalid)).toThrow("Amortization period");
    });

    it("should reject invalid rent scenario", () => {
      const invalid = { ...validAssumptions, rentScenario: "P90" as any };
      expect(() => validateAssumptions(invalid)).toThrow("Rent scenario");
    });

    it("should reject management percentage above 50%", () => {
      const invalid = { ...validAssumptions, mgmtPct: 0.6 };
      expect(() => validateAssumptions(invalid)).toThrow(
        "Management percentage"
      );
    });
  });
});
