/**
 * Integration test between Ingestor and Enrichment services
 * Tests end-to-end communication via message bus
 */

import { MemoryRepo as IngestorRepo } from "../../ingestor/src/adapters/repo.memory";
import { runOnce } from "../../ingestor/src/core/poller";
import { SourcePort } from "../../ingestor/src/core/ports";

import { MemoryCache } from "@realestate/shared-utils";
import { CMHCAPI } from "../../enrichment/src/adapters/cmhc.api";
import { GeocoderAPI } from "../../enrichment/src/adapters/geocode.api";
import {
  MemoryEnrichmentRepo,
  MemoryListingRepo,
} from "../../enrichment/src/adapters/repo.memory";
import { TaxesTable } from "../../enrichment/src/adapters/taxes.table";
import { WalkScoreAPI } from "../../enrichment/src/adapters/walkscore.api";
import { EnrichmentScheduler } from "../../enrichment/src/core/scheduler";

// Custom MockSource for integration testing
class TestMockSource implements SourcePort {
  private mockListings: any[] = [];

  addMockListing(listing: any) {
    this.mockListings.push(listing);
  }

  updateMockListing(mlsNumber: string, updates: any) {
    const listing = this.mockListings.find((l) => l.MlsNumber === mlsNumber);
    if (listing) {
      Object.assign(listing, updates);
    }
  }

  async fetchUpdatedSince(
    since: string,
    pageToken?: string
  ): Promise<{ items: any[]; nextPage?: string; maxUpdatedAt: string }> {
    // Filter items updated since the watermark
    const sinceDate = new Date(since);
    const filtered = this.mockListings.filter((item) => {
      const updatedDate = new Date(item.Updated);
      return updatedDate > sinceDate;
    });

    // Sort by updated date for consistent pagination
    filtered.sort(
      (a, b) => new Date(a.Updated).getTime() - new Date(b.Updated).getTime()
    );

    const items = filtered;
    const maxUpdatedAt =
      items.length > 0
        ? items.reduce((max, item) => {
            const itemDate = new Date(item.Updated);
            const maxDate = new Date(max);
            return itemDate > maxDate ? item.Updated : max;
          }, items[0].Updated)
        : since;

    return {
      items,
      nextPage: undefined,
      maxUpdatedAt,
    };
  }
}

// Shared Message Bus Implementation
class SharedMessageBus {
  private subscribers = new Map<string, ((event: any) => Promise<void>)[]>();
  private publishedEvents: any[] = [];
  private queuedEvents: any[] = [];
  private processingEnabled = true;

  // Ingestor publishes events here
  async publish(evt: any): Promise<void> {
    const topic = evt.type;
    console.log(`[SharedBus] Publishing ${topic} event for listing ${evt.id}`);
    this.publishedEvents.push(evt);

    if (!this.processingEnabled) {
      console.log(`[SharedBus] Queuing event for later processing`);
      this.queuedEvents.push(evt);
      return;
    }

    await this.processEvent(evt);
  }

  private async processEvent(evt: any): Promise<void> {
    const topic = evt.type;
    const handlers = this.subscribers.get(topic) || [];
    for (const handler of handlers) {
      try {
        await handler(evt);
      } catch (error) {
        console.error(`[SharedBus] Handler error for ${topic}:`, error);
      }
    }
  }

  // Control event processing
  pauseProcessing(): void {
    this.processingEnabled = false;
  }

  async resumeProcessing(): Promise<void> {
    this.processingEnabled = true;
    console.log(
      `[SharedBus] Resuming processing of ${this.queuedEvents.length} queued events`
    );

    const events = [...this.queuedEvents];
    this.queuedEvents = [];

    for (const evt of events) {
      await this.processEvent(evt);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay between events
    }
  }

  // Enrichment service subscribes here
  async subscribe(
    topic: string,
    handler: (event: any) => Promise<void>
  ): Promise<void> {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, []);
    }
    this.subscribers.get(topic)!.push(handler);
    console.log(`[SharedBus] Service subscribed to topic: ${topic}`);
  }

  // Stats for monitoring
  getStats() {
    const stats: Record<string, number> = {};
    for (const [topic, handlers] of this.subscribers.entries()) {
      stats[topic] = handlers.length;
    }
    return { ...stats, totalPublished: this.publishedEvents.length };
  }

  getPublishedEvents() {
    return [...this.publishedEvents];
  }

  clearEvents() {
    this.publishedEvents = [];
  }
}

export async function testIngestorEnrichmentIntegration() {
  console.log("🔗 Integration Test: Ingestor → Enrichment Communication\n");

  // Shared message bus
  const sharedBus = new SharedMessageBus();

  // 1. Set up Ingestor
  console.log("📥 Setting up Ingestor service...");
  const ingestorRepo = new IngestorRepo();
  const mockSource = new TestMockSource();

  // Add mock listings in TREB format (what the ingestor expects)
  mockSource.addMockListing({
    MlsNumber: "C1234567",
    Status: "A",
    ListDate: new Date().toISOString(),
    Updated: new Date().toISOString(),
    Address: {
      StreetNumber: "100",
      StreetName: "King St W",
      City: "Toronto",
      PostalCode: "M5X 1A1",
    },
    Geo: {
      Latitude: 43.6532,
      Longitude: -79.3832,
    },
    PropertyType: "CondoApt",
    ListPrice: 850000,
    TaxAnnualAmount: 5500,
    AssociationFee: 450,
    BedroomsTotal: 2,
    BathroomsTotalInteger: 2,
    Media: [],
  });

  mockSource.addMockListing({
    MlsNumber: "C1234568",
    Status: "A",
    ListDate: new Date().toISOString(),
    Updated: new Date().toISOString(),
    Address: {
      StreetNumber: "200",
      StreetName: "Queen St E",
      City: "Toronto",
      PostalCode: "M5A 1S2",
    },
    PropertyType: "CondoApt",
    ListPrice: 650000,
    BedroomsTotal: 1,
    BathroomsTotalInteger: 1,
    Media: [],
  });

  // 2. Set up Enrichment service
  console.log("🔍 Setting up Enrichment service...");
  const enrichmentRepo = new MemoryEnrichmentRepo();

  // Create a listing repo that the enrichment service can read from
  const listingRepo = new MemoryListingRepo();

  const cache = new MemoryCache();
  const walkScore = new WalkScoreAPI(undefined, true);
  const cmhc = new CMHCAPI(true);
  const geocoder = new GeocoderAPI("mock");
  const taxes = new TaxesTable();

  // Create enrichment scheduler
  const enrichmentScheduler = new EnrichmentScheduler(
    {
      listingRepo,
      enrRepo: enrichmentRepo,
      bus: sharedBus as any, // Type compatibility
      cache,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
    },
    {
      debounceTimeoutSec: 1, // Short timeout for testing
      publishUnderwriteEvents: true,
      logLevel: "info",
    }
  );

  // 3. Start enrichment service
  await enrichmentScheduler.start();
  console.log("✅ Enrichment service started and subscribed to events\n");

  // 3.5. Pause event processing until data is synced
  sharedBus.pauseProcessing();

  // 4. Sync data from ingestor to enrichment listing repo
  // This simulates a shared database or data sync process
  const syncListingData = async () => {
    const ingestorListings = ingestorRepo.getAllListings();
    for (const listing of ingestorListings) {
      // Convert ingestor format to enrichment format
      listingRepo.setListing({
        id: listing.id,
        updatedAt: listing.updatedAt,
        address: {
          street: listing.address.street,
          city: listing.address.city,
          province: listing.address.province,
          postalCode: listing.address.postalCode,
          lat: listing.address.lat,
          lng: listing.address.lng,
        },
        listPrice: listing.listPrice,
        taxesAnnual: listing.taxesAnnual,
        condoFeeMonthly: listing.condoFeeMonthly,
        propertyType: listing.propertyType,
      });
    }
  };

  // 5. Run ingestor poll (this will publish events)
  console.log("📊 Running ingestor poll...");
  const pollResult = await runOnce(
    mockSource,
    ingestorRepo,
    sharedBus as any, // Type compatibility
    "MOCK"
  );

  console.log("✅ Ingestor poll completed:", {
    processed: pollResult.processed,
    changed: pollResult.changed,
    duration: `${pollResult.durationMs}ms`,
  });

  // 6. Sync the data so enrichment service can read it
  await syncListingData();
  console.log("🔄 Synced listing data between services\n");

  // 6.5. Resume event processing now that data is available
  await sharedBus.resumeProcessing();

  // 7. Wait for enrichment processing
  console.log("⏳ Waiting for enrichment processing...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 8. Check results
  console.log("📈 Integration Test Results:\n");

  // Ingestor stats
  console.log("📥 Ingestor Results:");
  console.log(`- Listings processed: ${pollResult.processed}`);
  console.log(`- Listings changed: ${pollResult.changed}`);
  console.log(`- Repository size: ${ingestorRepo.getAllListings().length}`);

  // Message bus stats
  console.log("\n🚌 Message Bus Stats:");
  const busStats = sharedBus.getStats();
  console.log(`- Subscribers:`, busStats);

  // Enrichment stats
  console.log("\n🔍 Enrichment Results:");
  const enrichmentMetrics = enrichmentScheduler.getMetrics();
  console.log(`- Events received: ${enrichmentMetrics.eventsReceived}`);
  console.log(`- Events processed: ${enrichmentMetrics.eventsProcessed}`);
  console.log(`- Enrichments changed: ${enrichmentMetrics.enrichmentsChanged}`);
  console.log(
    `- Underwrite requests: ${enrichmentMetrics.underwriteRequestsPublished}`
  );
  console.log(`- Errors: ${enrichmentMetrics.errors}`);

  // Check enriched data
  console.log("\n📋 Enriched Listings:");
  const enrichedListings = enrichmentRepo.getAll();
  for (const enriched of enrichedListings) {
    console.log(`\n- Listing ${enriched.listingId}:`);
    console.log(
      `  • Geo: ${enriched.geo?.lat}, ${enriched.geo?.lng} (${enriched.geo?.source})`
    );
    console.log(
      `  • Tax: $${enriched.taxes?.annualEstimate} (${enriched.taxes?.method})`
    );
    console.log(`  • Walk Score: ${enriched.locationScores?.walk}`);
    console.log(`  • Rent P50: $${enriched.rentPriors?.p50}`);
    console.log(`  • LTT Rule: ${enriched.costRules?.lttRule}`);
    console.log(`  • Version: ${enriched.enrichmentVersion}`);
  }

  // 9. Test update scenario
  console.log("\n🔄 Testing Update Scenario...");

  // Pause processing for update
  sharedBus.pauseProcessing();

  // Update a listing in the mock source
  mockSource.updateMockListing("C1234567", {
    ListPrice: 875000, // Price increase
    Updated: new Date().toISOString(),
  });

  // Run another poll
  const updatePollResult = await runOnce(
    mockSource,
    ingestorRepo,
    sharedBus as any,
    "MOCK"
  );

  // Sync data again
  await syncListingData();

  // Resume processing
  await sharedBus.resumeProcessing();

  // Wait for processing
  await new Promise((resolve) => setTimeout(resolve, 1500));

  console.log("✅ Update poll completed:", {
    processed: updatePollResult.processed,
    changed: updatePollResult.changed,
  });

  // Final metrics
  const finalMetrics = enrichmentScheduler.getMetrics();
  console.log("\n📊 Final Enrichment Metrics:");
  console.log(`- Total events received: ${finalMetrics.eventsReceived}`);
  console.log(`- Total events processed: ${finalMetrics.eventsProcessed}`);
  console.log(
    `- Total enrichments changed: ${finalMetrics.enrichmentsChanged}`
  );
  console.log(
    `- Total underwrite requests: ${finalMetrics.underwriteRequestsPublished}`
  );

  // 10. Cleanup
  enrichmentScheduler.stop();
  console.log("\n✅ Integration test completed successfully!");

  // Get final enriched listings count
  const finalEnrichedListings = enrichmentRepo.getAll();

  // Verify communication worked
  const success =
    finalMetrics.eventsReceived > 0 &&
    finalMetrics.eventsProcessed > 0 &&
    finalMetrics.enrichmentsChanged > 0;

  if (success) {
    console.log(
      "🎉 SUCCESS: Services communicated successfully via message bus!"
    );
    console.log(`📊 Final Summary:`);
    console.log(`  - Events received: ${finalMetrics.eventsReceived}`);
    console.log(`  - Events processed: ${finalMetrics.eventsProcessed}`);
    console.log(
      `  - Enrichments created/updated: ${finalMetrics.enrichmentsChanged}`
    );
    console.log(
      `  - Underwrite requests published: ${finalMetrics.underwriteRequestsPublished}`
    );
    console.log(
      `  - Final enriched listings count: ${finalEnrichedListings.length}`
    );
    return {
      success: true,
      metrics: finalMetrics,
      enrichedCount: finalEnrichedListings.length,
    };
  } else {
    console.log("❌ FAILURE: Communication between services failed");
    console.log(`Debug info:`);
    console.log(`  - Events received: ${finalMetrics.eventsReceived}`);
    console.log(`  - Events processed: ${finalMetrics.eventsProcessed}`);
    console.log(`  - Enrichments changed: ${finalMetrics.enrichmentsChanged}`);
    console.log(`  - Final enriched listings: ${finalEnrichedListings.length}`);
    throw new Error("Integration test failed");
  }
}

// Run the integration test if called directly
if (require.main === module) {
  testIngestorEnrichmentIntegration().catch((error) => {
    console.error("❌ Integration test failed:", error);
    process.exit(1);
  });
}
