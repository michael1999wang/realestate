import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCache } from "../src/adapters/cache.memory";
import { CMHCAPI } from "../src/adapters/cmhc.api";
import { GeocoderAPI } from "../src/adapters/geocode.api";
import {
  MemoryEnrichmentRepo,
  MemoryListingRepo,
} from "../src/adapters/repo.memory";
import { TaxesTable } from "../src/adapters/taxes.table";
import { WalkScoreAPI } from "../src/adapters/walkscore.api";
import { enrichOne } from "../src/core/enrich";

describe("enrichOne", () => {
  let listingRepo: MemoryListingRepo;
  let enrRepo: MemoryEnrichmentRepo;
  let cache: MemoryCache;
  let walkScore: WalkScoreAPI;
  let cmhc: CMHCAPI;
  let geocoder: GeocoderAPI;
  let taxes: TaxesTable;

  beforeEach(() => {
    listingRepo = new MemoryListingRepo();
    enrRepo = new MemoryEnrichmentRepo();
    cache = new MemoryCache();
    walkScore = new WalkScoreAPI(undefined, true); // mock mode
    cmhc = new CMHCAPI(true); // mock mode
    geocoder = new GeocoderAPI("mock");
    taxes = new TaxesTable();
  });

  it("should return unchanged=false for non-existent listing", async () => {
    const result = await enrichOne("non-existent", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result.changed).toBe(false);
    expect(result.enrichment).toBeUndefined();
  });

  it("should enrich listing with coordinates and return walkscore", async () => {
    // Setup test listing with coordinates
    listingRepo.setListing({
      id: "listing-1",
      updatedAt: "2024-01-01T00:00:00Z",
      address: {
        street: "123 King St",
        city: "Toronto",
        province: "ON",
        postalCode: "M5V 3A1",
        lat: 43.6532,
        lng: -79.3832,
      },
      listPrice: 800000,
      taxesAnnual: 5000,
      condoFeeMonthly: 400,
      propertyType: "Condo",
    });

    const result = await enrichOne("listing-1", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result.changed).toBe(true);
    expect(result.enrichment).toBeDefined();

    const enrichment = result.enrichment!;
    expect(enrichment.listingId).toBe("listing-1");
    expect(enrichment.enrichmentVersion).toBe("1.0.0");

    // Should use listing coordinates
    expect(enrichment.geo?.source).toBe("listing");
    expect(enrichment.geo?.lat).toBe(43.6532);
    expect(enrichment.geo?.lng).toBe(-79.3832);
    expect(enrichment.geo?.fsa).toBe("M5V");

    // Should use exact tax amount
    expect(enrichment.taxes?.annualEstimate).toBe(5000);
    expect(enrichment.taxes?.method).toBe("exact");

    // Should have location scores
    expect(enrichment.locationScores).toBeDefined();
    expect(enrichment.locationScores?.provider).toBe("walkscore");
    expect(typeof enrichment.locationScores?.walk).toBe("number");

    // Should have rent priors
    expect(enrichment.rentPriors).toBeDefined();
    expect(enrichment.rentPriors?.source).toBe("cmhc");
    expect(typeof enrichment.rentPriors?.p50).toBe("number");

    // Should have cost rules
    expect(enrichment.costRules?.lttRule).toBe("toronto_double");
    expect(typeof enrichment.costRules?.insuranceMonthlyEstimate).toBe(
      "number"
    );
  });

  it("should geocode when listing has no coordinates", async () => {
    listingRepo.setListing({
      id: "listing-2",
      updatedAt: "2024-01-01T00:00:00Z",
      address: {
        street: "456 Queen St",
        city: "Toronto",
        province: "ON",
        postalCode: "M5G 2B3",
      },
      listPrice: 600000,
      propertyType: "Apartment",
    });

    const result = await enrichOne("listing-2", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result.changed).toBe(true);
    const enrichment = result.enrichment!;

    // Should geocode coordinates
    expect(enrichment.geo?.source).toBe("geocoded");
    expect(enrichment.geo?.lat).toBeDefined();
    expect(enrichment.geo?.lng).toBeDefined();
    expect(enrichment.geo?.fsa).toBeDefined();
  });

  it("should estimate taxes when not provided", async () => {
    listingRepo.setListing({
      id: "listing-3",
      updatedAt: "2024-01-01T00:00:00Z",
      address: {
        street: "789 Bay St",
        city: "Toronto",
        province: "ON",
      },
      listPrice: 1000000,
      propertyType: "Condo",
    });

    const result = await enrichOne("listing-3", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result.changed).toBe(true);
    const enrichment = result.enrichment!;

    // Should estimate taxes using rate table
    expect(enrichment.taxes?.method).toBe("rate_table");
    expect(enrichment.taxes?.annualEstimate).toBeGreaterThan(0);
    // Toronto rate is 0.0063, so 1M should be ~6300
    expect(enrichment.taxes?.annualEstimate).toBe(6300);
  });

  it("should flag missing and outlier condo fees", async () => {
    // Test missing fee
    listingRepo.setListing({
      id: "listing-4",
      updatedAt: "2024-01-01T00:00:00Z",
      address: {
        street: "100 Main St",
        city: "Toronto",
        province: "ON",
      },
      listPrice: 500000,
      propertyType: "Condo",
      // condoFeeMonthly not provided
    });

    const result1 = await enrichOne("listing-4", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result1.enrichment?.fees?.sanityFlags).toContain("fee_missing");

    // Test outlier fee
    listingRepo.clear();
    listingRepo.setListing({
      id: "listing-5",
      updatedAt: "2024-01-01T00:00:00Z",
      address: {
        street: "200 Main St",
        city: "Toronto",
        province: "ON",
      },
      listPrice: 500000,
      propertyType: "Condo",
      condoFeeMonthly: 3000, // outlier high
    });

    const result2 = await enrichOne("listing-5", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result2.enrichment?.fees?.sanityFlags).toContain("fee_outlier");
  });

  it("should cache walkscore results on second call", async () => {
    listingRepo.setListing({
      id: "listing-6",
      updatedAt: "2024-01-01T00:00:00Z",
      address: {
        street: "300 Front St",
        city: "Toronto",
        province: "ON",
        lat: 43.65,
        lng: -79.38,
      },
      listPrice: 700000,
      propertyType: "Condo",
    });

    // First call
    const result1 = await enrichOne("listing-6", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result1.changed).toBe(true);
    const scores1 = result1.enrichment?.locationScores;

    // Verify cache has the entry
    const cacheKey = "walkscore:43.6500,-79.3800";
    expect(cache.has(cacheKey)).toBe(true);

    // Second call should use cache
    const result2 = await enrichOne("listing-6", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result2.changed).toBe(false); // Should be identical
    const scores2 = result2.enrichment?.locationScores;
    expect(scores2).toEqual(scores1);
  });

  it("should be idempotent when inputs unchanged", async () => {
    listingRepo.setListing({
      id: "listing-7",
      updatedAt: "2024-01-01T00:00:00Z",
      address: {
        street: "400 College St",
        city: "Toronto",
        province: "ON",
        lat: 43.66,
        lng: -79.4,
      },
      listPrice: 900000,
      taxesAnnual: 7000,
      condoFeeMonthly: 500,
      propertyType: "Condo",
    });

    // First enrichment
    const result1 = await enrichOne("listing-7", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result1.changed).toBe(true);

    // Second enrichment with same data
    const result2 = await enrichOne("listing-7", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result2.changed).toBe(false);

    // Should have same enrichment data (ignoring computedAt)
    const { computedAt: _, ...enrichment1 } = result1.enrichment!;
    const { computedAt: __, ...enrichment2 } = result2.enrichment!;
    expect(enrichment2).toEqual(enrichment1);
  });

  it("should handle different provinces correctly", async () => {
    // Test Vancouver
    listingRepo.setListing({
      id: "listing-8",
      updatedAt: "2024-01-01T00:00:00Z",
      address: {
        street: "500 Robson St",
        city: "Vancouver",
        province: "BC",
      },
      listPrice: 1200000,
      propertyType: "Condo",
    });

    const result = await enrichOne("listing-8", {
      listingRepo,
      enrRepo,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
      cache,
    });

    expect(result.changed).toBe(true);
    const enrichment = result.enrichment!;

    // Should use BC tax rate and LTT rule
    expect(enrichment.taxes?.method).toBe("rate_table");
    expect(enrichment.costRules?.lttRule).toBe("bc_default");

    // Should geocode to Vancouver area
    expect(enrichment.geo?.lat).toBeCloseTo(49.28, 1);
    expect(enrichment.geo?.lng).toBeCloseTo(-123.12, 1);
  });
});
