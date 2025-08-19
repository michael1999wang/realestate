#!/usr/bin/env ts-node

/**
 * Test script for the enrichment worker
 * This simulates the worker without requiring Docker
 */

import { LogBus } from "../src/adapters/bus.log";
import { MemoryCache } from "../src/adapters/cache.memory";
import { CMHCAPI } from "../src/adapters/cmhc.api";
import { GeocoderAPI } from "../src/adapters/geocode.api";
import {
  MemoryEnrichmentRepo,
  MemoryListingRepo,
} from "../src/adapters/repo.memory";
import { TaxesTable } from "../src/adapters/taxes.table";
import { WalkScoreAPI } from "../src/adapters/walkscore.api";
import { EnrichmentScheduler } from "../src/core/scheduler";

async function testWorker() {
  console.log("🧪 Testing Enrichment Worker (Memory Mode)\n");

  // Initialize all dependencies (memory mode)
  const listingRepo = new MemoryListingRepo();
  const enrRepo = new MemoryEnrichmentRepo();
  const cache = new MemoryCache();
  const bus = new LogBus();
  const walkScore = new WalkScoreAPI(undefined, true);
  const cmhc = new CMHCAPI(true);
  const geocoder = new GeocoderAPI("mock");
  const taxes = new TaxesTable();

  // Seed test data
  listingRepo.setListing({
    id: "test-listing-1",
    updatedAt: "2024-01-15T10:00:00Z",
    address: {
      street: "123 Bay Street",
      city: "Toronto",
      province: "ON",
      postalCode: "M5J 2R8",
      lat: 43.6426,
      lng: -79.3871,
    },
    listPrice: 750000,
    condoFeeMonthly: 650,
    propertyType: "Condo",
  });

  listingRepo.setListing({
    id: "test-listing-2",
    updatedAt: "2024-01-15T10:00:00Z",
    address: {
      street: "456 Richmond St W",
      city: "Toronto",
      province: "ON",
    },
    listPrice: 950000,
    taxesAnnual: 7500,
    propertyType: "Loft",
  });

  // Create scheduler
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
      debounceTimeoutSec: 3,
      publishUnderwriteEvents: true,
      logLevel: "info",
    }
  );

  console.log("Starting scheduler...\n");
  await scheduler.start();

  // Test scenario 1: Price change (immediate processing)
  console.log("📊 Test 1: Price change (immediate processing)");
  await (bus as any).simulateEvent("listing_changed", {
    type: "listing_changed",
    id: "test-listing-1",
    updatedAt: new Date().toISOString(),
    change: "update",
    source: "TRREB",
    dirty: ["price"],
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Test scenario 2: Non-financial change (debounced)
  console.log("\n📊 Test 2: Media change (debounced)");
  await (bus as any).simulateEvent("listing_changed", {
    type: "listing_changed",
    id: "test-listing-2",
    updatedAt: new Date().toISOString(),
    change: "update",
    source: "TRREB",
    dirty: ["media"],
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Test scenario 3: Address change (immediate processing)
  console.log("\n📊 Test 3: Address change (immediate processing)");
  await (bus as any).simulateEvent("listing_changed", {
    type: "listing_changed",
    id: "test-listing-2",
    updatedAt: new Date().toISOString(),
    change: "update",
    source: "TRREB",
    dirty: ["address"],
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Wait for debounce to expire
  console.log("\n⏰ Waiting for debounce timeout...");
  await new Promise((resolve) => setTimeout(resolve, 3500));

  // Final metrics
  const metrics = scheduler.getMetrics();
  console.log("\n📈 Final Results:");
  console.log(`- Events Received: ${metrics.eventsReceived}`);
  console.log(`- Events Processed: ${metrics.eventsProcessed}`);
  console.log(`- Events Debounced: ${metrics.eventsDebounced}`);
  console.log(`- Enrichments Changed: ${metrics.enrichmentsChanged}`);
  console.log(`- Underwrite Requests: ${metrics.underwriteRequestsPublished}`);
  console.log(`- Errors: ${metrics.errors}`);

  console.log(`\n📋 Repository Status:`);
  console.log(`- Total enrichments: ${enrRepo.size()}`);
  console.log(`- Cache entries: ${cache.size()}`);

  // Show sample enrichment
  const sampleEnrichment = await enrRepo.getByListingId("test-listing-1");
  if (sampleEnrichment) {
    console.log(`\n🎯 Sample Enrichment (test-listing-1):`);
    console.log(
      `- Geo: ${sampleEnrichment.geo?.lat}, ${sampleEnrichment.geo?.lng} (${sampleEnrichment.geo?.source})`
    );
    console.log(
      `- Tax: $${sampleEnrichment.taxes?.annualEstimate} (${sampleEnrichment.taxes?.method})`
    );
    console.log(`- Walk Score: ${sampleEnrichment.locationScores?.walk}`);
    console.log(`- Rent P50: $${sampleEnrichment.rentPriors?.p50}`);
    console.log(`- LTT Rule: ${sampleEnrichment.costRules?.lttRule}`);
  }

  scheduler.stop();
  console.log("\n✅ Worker test completed successfully!");
}

testWorker().catch((error) => {
  console.error("❌ Worker test failed:", error);
  process.exit(1);
});
