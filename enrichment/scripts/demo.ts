#!/usr/bin/env ts-node

/**
 * Demo script showing the enrichment service functionality
 * Run with: npx ts-node scripts/demo.ts
 */

import { MemoryCache } from "@realestate/shared-utils/cache";
import { LogBus } from "../src/adapters/bus.log";
import { CMHCAPI } from "../src/adapters/cmhc.api";
import { GeocoderAPI } from "../src/adapters/geocode.api";
import {
  MemoryEnrichmentRepo,
  MemoryListingRepo,
} from "../src/adapters/repo.memory";
import { TaxesTable } from "../src/adapters/taxes.table";
import { WalkScoreAPI } from "../src/adapters/walkscore.api";
import { enrichOne } from "../src/core/enrich";
import { EnrichmentScheduler } from "../src/core/scheduler";

async function demo() {
  console.log("🎯 Enrichment Service Demo\n");

  // Setup dependencies
  const listingRepo = new MemoryListingRepo();
  const enrRepo = new MemoryEnrichmentRepo();
  const cache = new MemoryCache();
  const walkScore = new WalkScoreAPI(undefined, true);
  const cmhc = new CMHCAPI(true);
  const geocoder = new GeocoderAPI("mock");
  const taxes = new TaxesTable();
  const bus = new LogBus();

  // Add test listings
  listingRepo.setListing({
    id: "demo-toronto-condo",
    updatedAt: "2024-01-15T10:00:00Z",
    address: {
      street: "88 Scott St",
      city: "Toronto",
      province: "ON",
      postalCode: "M5E 1G5",
      lat: 43.6532,
      lng: -79.3832,
    },
    listPrice: 950000,
    taxesAnnual: 6000,
    condoFeeMonthly: 485,
    propertyType: "Condo",
  });

  listingRepo.setListing({
    id: "demo-vancouver-apartment",
    updatedAt: "2024-01-15T10:00:00Z",
    address: {
      street: "1234 Robson St",
      city: "Vancouver",
      province: "BC",
      postalCode: "V6Z 1A1",
    },
    listPrice: 1350000,
    condoFeeMonthly: 420,
    propertyType: "Apartment",
  });

  console.log("📋 Test Listings:");
  console.log("1. Toronto Condo - $950k with coordinates");
  console.log("2. Vancouver Apartment - $1.35M (will be geocoded)\n");

  // Demo 1: Direct enrichment
  console.log("🔍 Demo 1: Direct Enrichment\n");

  const result1 = await enrichOne("demo-toronto-condo", {
    listingRepo,
    enrRepo,
    walk: walkScore,
    cmhc,
    taxes,
    geo: geocoder,
    cache,
  });

  console.log("Toronto Condo Enrichment:");
  console.log(`- Changed: ${result1.changed}`);
  console.log(`- Geo Source: ${result1.enrichment?.geo?.source}`);
  console.log(`- Walk Score: ${result1.enrichment?.locationScores?.walk}`);
  console.log(
    `- Tax Method: ${result1.enrichment?.taxes?.method} ($${result1.enrichment?.taxes?.annualEstimate})`
  );
  console.log(`- Rent P50: $${result1.enrichment?.rentPriors?.p50}`);
  console.log(`- LTT Rule: ${result1.enrichment?.costRules?.lttRule}`);
  console.log(
    `- Fee Flags: ${
      result1.enrichment?.fees?.sanityFlags?.join(", ") || "None"
    }\n`
  );

  const result2 = await enrichOne("demo-vancouver-apartment", {
    listingRepo,
    enrRepo,
    walk: walkScore,
    cmhc,
    taxes,
    geo: geocoder,
    cache,
  });

  console.log("Vancouver Apartment Enrichment:");
  console.log(`- Changed: ${result2.changed}`);
  console.log(`- Geo Source: ${result2.enrichment?.geo?.source}`);
  console.log(
    `- Coordinates: ${result2.enrichment?.geo?.lat?.toFixed(
      4
    )}, ${result2.enrichment?.geo?.lng?.toFixed(4)}`
  );
  console.log(
    `- Tax Method: ${result2.enrichment?.taxes?.method} ($${result2.enrichment?.taxes?.annualEstimate})`
  );
  console.log(`- Rent P50: $${result2.enrichment?.rentPriors?.p50}`);
  console.log(`- LTT Rule: ${result2.enrichment?.costRules?.lttRule}\n`);

  // Demo 2: Idempotency
  console.log("🔄 Demo 2: Idempotency Test\n");

  const result3 = await enrichOne("demo-toronto-condo", {
    listingRepo,
    enrRepo,
    walk: walkScore,
    cmhc,
    taxes,
    geo: geocoder,
    cache,
  });

  console.log(
    `Second enrichment of same listing - Changed: ${result3.changed} (should be false)\n`
  );

  // Demo 3: Cache effectiveness
  console.log("📊 Demo 3: Cache Stats\n");
  console.log(`Cache size: ${cache.size()} entries`);
  console.log(`WalkScore cached: ${cache.has("walkscore:43.6532,-79.3832")}`);
  console.log(
    `Rent priors cached: ${cache.has("rentpriors:Toronto:M5E:Condo")}\n`
  );

  // Demo 4: Scheduler with debounce
  console.log("⏰ Demo 4: Scheduler with Debounce\n");

  const scheduler = new EnrichmentScheduler(
    {
      listingRepo,
      enrRepo,
      bus,
      cache,
      walk: walkScore,
      cmhc,
      taxes,
      geo: geocoder,
    },
    {
      debounceTimeoutSec: 2, // Short timeout for demo
      publishUnderwriteEvents: true,
      logLevel: "info",
    }
  );

  await scheduler.start();

  // Simulate events
  console.log("Simulating listing_changed events...\n");

  // Event 1: Non-financial change (should be debounced)
  await (bus as any).simulateEvent("listing_changed", {
    type: "listing_changed",
    id: "demo-toronto-condo",
    updatedAt: new Date().toISOString(),
    change: "update",
    source: "MOCK",
    dirty: ["media", "status"],
  });

  // Event 2: Financial change (should process immediately)
  await (bus as any).simulateEvent("listing_changed", {
    type: "listing_changed",
    id: "demo-vancouver-apartment",
    updatedAt: new Date().toISOString(),
    change: "update",
    source: "MOCK",
    dirty: ["price", "fees"],
  });

  // Wait a moment for processing
  await new Promise((resolve) => setTimeout(resolve, 100));

  const metrics = scheduler.getMetrics();
  console.log("\nScheduler Metrics:");
  console.log(`- Events Received: ${metrics.eventsReceived}`);
  console.log(`- Events Processed: ${metrics.eventsProcessed}`);
  console.log(`- Events Debounced: ${metrics.eventsDebounced}`);
  console.log(`- Enrichments Changed: ${metrics.enrichmentsChanged}`);
  console.log(`- Underwrite Requests: ${metrics.underwriteRequestsPublished}`);
  console.log(`- Errors: ${metrics.errors}\n`);

  scheduler.stop();

  // Demo 5: Repository stats
  console.log("📈 Demo 5: Repository Stats\n");
  console.log(`Total enrichments stored: ${enrRepo.size()}`);
  const allEnrichments = enrRepo.getAll();
  for (const enrichment of allEnrichments) {
    console.log(`- ${enrichment.listingId}: v${enrichment.enrichmentVersion}`);
  }

  console.log("\n✅ Demo completed successfully!");
  console.log("\n🚀 To run the full worker: npm run dev");
  console.log("🐳 To start with Docker: docker compose up -d && npm run dev");
}

// Run the demo
demo().catch((error) => {
  console.error("❌ Demo failed:", error);
  process.exit(1);
});
