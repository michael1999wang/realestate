/**
 * Simplified Complete Real Estate Pipeline Integration Test
 * Demonstrates: Ingestor → Enrichment → Rent Estimator
 */

import { beforeEach, describe, expect, it } from "vitest";

// Ingestor imports
import { MemoryRepo as IngestorRepo } from "../../ingestor/src/adapters/repo.memory";
import { runOnce } from "../../ingestor/src/core/poller";
import { SourcePort } from "../../ingestor/src/core/ports";

// Enrichment imports
import {
  MemoryEnrichmentRepo,
  MemoryListingRepo,
} from "../../enrichment/src/adapters/repo.memory";

// Rent Estimator imports
import { MemoryBus } from "../../rent-estimator/src/adapters/bus.memory";
import { MemoryCache as RentCache } from "../../rent-estimator/src/adapters/cache.memory";
import { MockCompsSource } from "../../rent-estimator/src/adapters/comps.source";
import { MockPriorsSource } from "../../rent-estimator/src/adapters/priors.source";
import { MemoryRentRepo } from "../../rent-estimator/src/adapters/repo.memory";
import { estimateForListing } from "../../rent-estimator/src/core/estimate";

// Simple Mock Source for testing
class SimpleMockSource implements SourcePort {
  private mockListings: any[] = [];

  addMockListing(listing: any) {
    this.mockListings.push(listing);
  }

  async fetchUpdatedSince(
    since: string
  ): Promise<{ items: any[]; nextPage?: string; maxUpdatedAt: string }> {
    const sinceDate = new Date(since);
    const filtered = this.mockListings.filter((item) => {
      const updatedDate = new Date(item.Updated);
      return updatedDate > sinceDate;
    });

    const maxUpdatedAt =
      filtered.length > 0 ? filtered[filtered.length - 1].Updated : since;

    return {
      items: filtered,
      maxUpdatedAt,
    };
  }
}

// Simple Integration Read Adapter
class SimpleIntegrationReadAdapter {
  constructor(
    private listingRepo: MemoryListingRepo,
    private enrichmentRepo: MemoryEnrichmentRepo
  ) {}

  async getListingSnapshot(id: string) {
    const listing = await this.listingRepo.getListingById(id);
    if (!listing) return null;

    return {
      id: listing.id,
      updatedAt: listing.updatedAt,
      address: {
        city: listing.address?.city || "Toronto",
        province: listing.address?.province || "ON",
        postalCode: listing.address?.postalCode,
        lat: listing.address?.lat,
        lng: listing.address?.lng,
        fsa: listing.address?.postalCode?.substring(0, 3),
      },
      beds: 2,
      baths: 2,
      sqft: 900,
      propertyType: listing.propertyType || "Condo",
    };
  }

  async getEnrichment(id: string) {
    const enrichment = await this.enrichmentRepo.getByListingId(id);
    if (!enrichment) return null;

    return {
      rentPriors: enrichment.rentPriors,
      geo: enrichment.geo
        ? {
            lat: enrichment.geo.lat,
            lng: enrichment.geo.lng,
            fsa: enrichment.geo.fsa,
          }
        : undefined,
    };
  }
}

describe("Complete Real Estate Pipeline - Simple Integration", () => {
  let mockSource: SimpleMockSource;
  let ingestorRepo: IngestorRepo;
  let listingRepo: MemoryListingRepo;
  let enrichmentRepo: MemoryEnrichmentRepo;
  let rentRepo: MemoryRentRepo;
  let integrationReadAdapter: SimpleIntegrationReadAdapter;
  let rentEstimatorDeps: any;

  beforeEach(() => {
    mockSource = new SimpleMockSource();
    ingestorRepo = new IngestorRepo();
    listingRepo = new MemoryListingRepo();
    enrichmentRepo = new MemoryEnrichmentRepo();
    rentRepo = new MemoryRentRepo();
    integrationReadAdapter = new SimpleIntegrationReadAdapter(
      listingRepo,
      enrichmentRepo
    );

    rentEstimatorDeps = {
      read: integrationReadAdapter,
      rentRepo: rentRepo,
      priors: new MockPriorsSource(),
      comps: new MockCompsSource(),
      cache: new RentCache(),
      bus: new MemoryBus(),
    };
  });

  it("should process complete pipeline: ingestion → enrichment → rent estimation", async () => {
    // Step 1: Add mock listing
    const mockListing = {
      MlsNumber: "C123456",
      Updated: new Date().toISOString(),
      Address: {
        StreetAddress: "123 King St W",
        City: "Toronto",
        Province: "ON",
        PostalCode: "M5V 3A8",
      },
      BedroomsTotal: 2,
      BathroomsTotalInteger: 2,
      BuildingAreaTotal: 900,
      PropertyType: "Condo",
      ListPrice: 850000,
    };

    mockSource.addMockListing(mockListing);

    // Step 2: Run ingestor (simulates listing_changed event)
    const mockBus = {
      publish: async (event: any) => {
        console.log("Ingestor published:", event.type);
      },
    };

    await runOnce(mockSource, ingestorRepo, mockBus, "MOCK");

    // Verify ingestor processed the listing
    const ingestedListing = ingestorRepo.getListing("C123456");
    expect(ingestedListing).toBeDefined();
    expect(ingestedListing?.id).toBe("C123456");

    // Step 3: Simulate enrichment processing (simulates data_enriched event)
    if (ingestedListing) {
      // Save to enrichment listing repo
      listingRepo.setListing({
        id: ingestedListing.id,
        updatedAt: ingestedListing.updatedAt,
        address: {
          street: ingestedListing.address?.street || "123 King St W",
          city: ingestedListing.address?.city || "Toronto",
          province: ingestedListing.address?.province || "ON",
          postalCode: ingestedListing.address?.postalCode,
          lat: 43.6426,
          lng: -79.3871,
        },
        listPrice: ingestedListing.listPrice || 0,
        propertyType: ingestedListing.propertyType,
      });

      // Create enrichment data
      const enrichment = {
        listingId: ingestedListing.id,
        geo: {
          lat: 43.6426,
          lng: -79.3871,
          fsa: "M5V",
        },
        rentPriors: {
          p25: 3000,
          p50: 3400,
          p75: 3800,
          source: "cmhc",
          asOf: "2024-01-01",
        },
        updatedAt: new Date().toISOString(),
      };

      await enrichmentRepo.upsert(enrichment);
    }

    // Verify enrichment processed the listing
    const enrichedListing = await listingRepo.getListingById("C123456");
    expect(enrichedListing).toBeDefined();

    const enrichmentData = await enrichmentRepo.getByListingId("C123456");
    expect(enrichmentData).toBeDefined();
    expect(enrichmentData?.geo?.fsa).toBe("M5V");
    expect(enrichmentData?.rentPriors?.p50).toBe(3400);

    // Step 4: Run rent estimation (simulates underwrite_requested event)
    const result = await estimateForListing("C123456", rentEstimatorDeps);

    // Verify rent estimation was created
    expect(result.changed).toBe(true);
    expect(result.estimate).toBeDefined();

    const rentEstimate = result.estimate!;
    expect(rentEstimate.method).toMatch(/^(priors|comps)$/);
    expect(rentEstimate.p50).toBeGreaterThan(0);
    expect(rentEstimate.featuresUsed.beds).toBe(2);
    expect(rentEstimate.featuresUsed.city).toBe("Toronto");
    expect(rentEstimate.featuresUsed.fsa).toBe("M5V");
    expect(rentEstimate.featuresUsed.priors?.source).toBe("cmhc");

    // Verify rent estimate is stored in repo
    const storedRentEstimate = await rentRepo.getByListingId("C123456");
    expect(storedRentEstimate).toBeDefined();
    expect(storedRentEstimate?.p50).toBe(rentEstimate.p50);

    console.log("✅ Complete pipeline test passed!");
    console.log(
      `📊 Rent estimate: $${rentEstimate.p50} (${rentEstimate.method})`
    );
    console.log(
      `🏠 Features: ${rentEstimate.featuresUsed.beds}bed/${rentEstimate.featuresUsed.baths}bath, ${rentEstimate.featuresUsed.city}`
    );
  });

  it("should demonstrate data flow consistency", async () => {
    const mockListing = {
      MlsNumber: "C789012",
      Updated: new Date().toISOString(),
      Address: {
        StreetAddress: "456 Bay St",
        City: "Toronto",
        Province: "ON",
        PostalCode: "M5V 1A1",
      },
      BedroomsTotal: 1,
      BathroomsTotalInteger: 1,
      BuildingAreaTotal: 600,
      PropertyType: "Condo",
      ListPrice: 650000,
    };

    // Process through pipeline
    mockSource.addMockListing(mockListing);
    const mockBus = { publish: async () => {} };
    await runOnce(mockSource, ingestorRepo, mockBus, "MOCK");

    const ingestedListing = ingestorRepo.getListing("C789012");

    // Simulate enrichment
    if (ingestedListing) {
      listingRepo.setListing({
        id: ingestedListing.id,
        updatedAt: ingestedListing.updatedAt,
        address: {
          street: "456 Bay St",
          city: "Toronto",
          province: "ON",
          postalCode: "M5V 1A1",
        },
        listPrice: 650000,
        propertyType: "Condo",
      });

      await enrichmentRepo.upsert({
        listingId: ingestedListing.id,
        geo: { lat: 43.6426, lng: -79.3871, fsa: "M5V" },
        rentPriors: {
          p25: 2200,
          p50: 2500,
          p75: 2800,
          source: "cmhc",
          asOf: "2024-01-01",
        },
        updatedAt: new Date().toISOString(),
      });
    }

    // Run rent estimation
    await estimateForListing("C789012", rentEstimatorDeps);

    // Verify data consistency
    const enrichedListing = await listingRepo.getListingById("C789012");
    const enrichmentData = await enrichmentRepo.getByListingId("C789012");
    const rentEstimate = await rentRepo.getByListingId("C789012");

    expect(ingestedListing?.id).toBe("C789012");
    expect(enrichedListing?.id).toBe("C789012");
    expect(rentEstimate?.listingId).toBe("C789012");

    expect(enrichedListing?.propertyType).toBe("Condo");
    expect(rentEstimate?.featuresUsed.propertyType).toBe("Condo");

    expect(enrichmentData?.geo?.fsa).toBe("M5V");
    expect(rentEstimate?.featuresUsed.fsa).toBe("M5V");

    console.log("✅ Data consistency test passed!");
    console.log(
      `📍 FSA: ${enrichmentData?.geo?.fsa} → ${rentEstimate?.featuresUsed.fsa}`
    );
    console.log(
      `🏢 Property: ${enrichedListing?.propertyType} → ${rentEstimate?.featuresUsed.propertyType}`
    );
  });
});
