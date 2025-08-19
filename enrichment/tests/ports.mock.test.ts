import { describe, expect, it } from "vitest";
import { CMHCAPI } from "../src/adapters/cmhc.api";
import { GeocoderAPI } from "../src/adapters/geocode.api";
import { TaxesTable } from "../src/adapters/taxes.table";
import { WalkScoreAPI } from "../src/adapters/walkscore.api";

describe("Mock API Ports", () => {
  describe("WalkScoreAPI", () => {
    it("should return deterministic scores for same coordinates", async () => {
      const api = new WalkScoreAPI(undefined, true);

      const scores1 = await api.getScores(43.6532, -79.3832);
      const scores2 = await api.getScores(43.6532, -79.3832);

      expect(scores1).toEqual(scores2);
      expect(scores1.walk).toBeDefined();
      expect(scores1.transit).toBeDefined();
      expect(scores1.bike).toBeDefined();
    });

    it("should return higher scores for downtown Toronto", async () => {
      const api = new WalkScoreAPI(undefined, true);

      // Downtown Toronto coordinates
      const downtownScores = await api.getScores(43.6532, -79.3832);

      // Suburban coordinates (outside downtown box)
      const suburbanScores = await api.getScores(43.7, -79.5);

      expect(downtownScores.walk!).toBeGreaterThan(suburbanScores.walk!);
      expect(downtownScores.transit!).toBeGreaterThan(suburbanScores.transit!);
    });

    it("should return different scores for different coordinates", async () => {
      const api = new WalkScoreAPI(undefined, true);

      const scores1 = await api.getScores(43.6532, -79.3832);
      const scores2 = await api.getScores(43.7, -79.4);

      expect(scores1).not.toEqual(scores2);
    });
  });

  describe("CMHCAPI", () => {
    it("should return deterministic rent priors for same parameters", async () => {
      const api = new CMHCAPI(true);

      const priors1 = await api.getRentPriors({
        city: "Toronto",
        fsa: "M5V",
        propertyType: "Condo",
      });
      const priors2 = await api.getRentPriors({
        city: "Toronto",
        fsa: "M5V",
        propertyType: "Condo",
      });

      expect(priors1).toEqual(priors2);
      expect(priors1.p25).toBeDefined();
      expect(priors1.p50).toBeDefined();
      expect(priors1.p75).toBeDefined();
      expect(priors1.asOf).toBe("2024-01-01");
    });

    it("should return higher rents for Vancouver than Montreal", async () => {
      const api = new CMHCAPI(true);

      const vancouverPriors = await api.getRentPriors({
        city: "Vancouver",
        propertyType: "Condo",
      });
      const montrealPriors = await api.getRentPriors({
        city: "Montreal",
        propertyType: "Condo",
      });

      expect(vancouverPriors.p50!).toBeGreaterThan(montrealPriors.p50!);
    });

    it("should adjust rents by property type", async () => {
      const api = new CMHCAPI(true);

      const condoPriors = await api.getRentPriors({
        city: "Toronto",
        propertyType: "Condo",
      });
      const housePriors = await api.getRentPriors({
        city: "Toronto",
        propertyType: "House",
      });
      const apartmentPriors = await api.getRentPriors({
        city: "Toronto",
        propertyType: "Apartment",
      });

      expect(housePriors.p50!).toBeGreaterThan(condoPriors.p50!);
      expect(condoPriors.p50!).toBeGreaterThan(apartmentPriors.p50!);
    });

    it("should have p25 < p50 < p75", async () => {
      const api = new CMHCAPI(true);

      const priors = await api.getRentPriors({
        city: "Toronto",
        propertyType: "Condo",
      });

      expect(priors.p25!).toBeLessThan(priors.p50!);
      expect(priors.p50!).toBeLessThan(priors.p75!);
    });
  });

  describe("GeocoderAPI", () => {
    it("should return deterministic coordinates for same address", async () => {
      const api = new GeocoderAPI("mock");

      const geo1 = await api.geocode("123 King St", "Toronto", "ON", "M5V 3A1");
      const geo2 = await api.geocode("123 King St", "Toronto", "ON", "M5V 3A1");

      expect(geo1).toEqual(geo2);
      expect(geo1.lat).toBeDefined();
      expect(geo1.lng).toBeDefined();
      expect(geo1.fsa).toBe("M5V");
    });

    it("should return different coordinates for different cities", async () => {
      const api = new GeocoderAPI("mock");

      const toronto = await api.geocode("123 Main St", "Toronto", "ON");
      const vancouver = await api.geocode("123 Main St", "Vancouver", "BC");

      expect(toronto.lat).not.toEqual(vancouver.lat);
      expect(toronto.lng).not.toEqual(vancouver.lng);

      // Toronto should be around 43.65, -79.38
      expect(toronto.lat!).toBeCloseTo(43.65, 0);
      expect(toronto.lng!).toBeCloseTo(-79.38, 0);

      // Vancouver should be around 49.28, -123.12
      expect(vancouver.lat!).toBeCloseTo(49.28, 0);
      expect(vancouver.lng!).toBeCloseTo(-123.12, 0);
    });

    it("should extract FSA from postal code", async () => {
      const api = new GeocoderAPI("mock");

      const geo = await api.geocode("456 Queen St", "Toronto", "ON", "M5G 2B3");

      expect(geo.fsa).toBe("M5G");
    });

    it("should generate mock Toronto neighborhoods", async () => {
      const api = new GeocoderAPI("mock");

      const geo = await api.geocode("789 Bay St", "Toronto", "ON");

      expect(geo.neighborhood).toBeDefined();
      expect(typeof geo.neighborhood).toBe("string");
      expect(geo.neighborhood!.length).toBeGreaterThan(0);
    });
  });

  describe("TaxesTable", () => {
    it("should return exact tax rates for known cities", async () => {
      const taxes = new TaxesTable();

      const torontoTax = await taxes.estimateAnnualTax({
        city: "Toronto",
        province: "ON",
        assessedValue: 1000000,
      });

      expect(torontoTax.method).toBe("rate_table");
      expect(torontoTax.annual).toBe(6300); // 1M * 0.0063
    });

    it("should fall back to province defaults for unknown cities", async () => {
      const taxes = new TaxesTable();

      const unknownCityTax = await taxes.estimateAnnualTax({
        city: "Unknown City",
        province: "ON",
        assessedValue: 1000000,
      });

      expect(unknownCityTax.method).toBe("rate_table");
      expect(unknownCityTax.annual).toBe(11000); // 1M * 0.011 (ON default)
    });

    it("should return unknown method for unknown provinces", async () => {
      const taxes = new TaxesTable();

      const unknownProvinceTax = await taxes.estimateAnnualTax({
        city: "Some City",
        province: "XX",
        assessedValue: 1000000,
      });

      expect(unknownProvinceTax.method).toBe("unknown");
      expect(unknownProvinceTax.annual).toBe(10000); // 1M * 0.01 (1% fallback)
    });

    it("should handle different assessment values correctly", async () => {
      const taxes = new TaxesTable();

      const tax1 = await taxes.estimateAnnualTax({
        city: "Toronto",
        province: "ON",
        assessedValue: 500000,
      });

      const tax2 = await taxes.estimateAnnualTax({
        city: "Toronto",
        province: "ON",
        assessedValue: 1000000,
      });

      expect(tax2.annual).toBe(tax1.annual * 2);
    });

    it("should provide tax rate info for testing", () => {
      const taxes = new TaxesTable();

      const torontoRate = taxes.getTaxRate("Toronto", "ON");
      expect(torontoRate).toBeDefined();
      expect(torontoRate!.rate).toBe(0.0063);

      const unknownRate = taxes.getTaxRate("Unknown", "ON");
      expect(unknownRate).toBeDefined();
      expect(unknownRate!.city).toBe("*");
      expect(unknownRate!.rate).toBe(0.011);
    });
  });
});
