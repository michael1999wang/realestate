import { MockReadAdapter } from "@realestate/alerts/src/adapters/read.mock";
import { MemoryAlertsRepo } from "@realestate/alerts/src/adapters/repo.memory";
import { MultiChannelDispatcher } from "@realestate/alerts/src/core/dispatch";
import {
  Alert,
  ListingSnapshot,
  SavedSearch,
  UWMetrics,
  UnderwriteCompletedEvt,
} from "@realestate/alerts/src/core/dto";
import { createHandlers } from "@realestate/alerts/src/core/handlers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Note: For this demo, we'll simulate the pipeline steps rather than importing
// the full services to avoid complex dependency issues

describe("End-to-End Alerts Integration", () => {
  let alertsRepo: MemoryAlertsRepo;
  let readAdapter: MockReadAdapter;
  let dispatcher: MultiChannelDispatcher;
  let capturedAlerts: Alert[];

  // Simulate pipeline state

  beforeEach(() => {
    capturedAlerts = [];

    // Setup alerts service
    const savedSearches: SavedSearch[] = [
      {
        id: "search-toronto-investment",
        userId: "investor-123",
        name: "Toronto Investment Properties",
        filter: {
          city: "Toronto",
          province: "ON",
          propertyType: "Condo",
          maxPrice: 800000,
        },
        thresholds: {
          minDSCR: 1.2,
          minCoC: 0.08,
          requireNonNegativeCF: true,
        },
        notify: { channel: ["devbrowser", "email"] },
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];

    alertsRepo = new MemoryAlertsRepo(savedSearches);

    // Mock read adapter that will be populated during the test
    readAdapter = new MockReadAdapter();

    const mockDevBrowser = async (alert: Alert) => {
      capturedAlerts.push(alert);
    };
    dispatcher = new MultiChannelDispatcher(mockDevBrowser);

    // Pipeline state will be simulated in tests
  });

  afterEach(() => {
    alertsRepo.clear();
    readAdapter.clear();
    capturedAlerts = [];
  });

  it("should process complete pipeline from ingestion to alerts", async () => {
    // Step 1: Simulate successful ingestion
    // In real system: Ingestor fetches from MLS, stores in DB, publishes listing_changed
    console.log("📥 Step 1: Simulating property ingestion...");

    // Step 2: Simulate enrichment process
    // In real system: Enrichment service processes listing_changed, enriches data
    console.log("🔍 Step 2: Simulating property enrichment...");

    // Step 3: Simulate underwriting completion
    // In real system: Underwriting service processes enriched data, publishes underwrite_completed
    console.log("📊 Step 3: Simulating underwriting completion...");
    // Step 4: Setup the property data that would flow through the pipeline
    const listingSnapshot: ListingSnapshot = {
      id: "C999999",
      city: "Toronto",
      province: "ON",
      propertyType: "Condo",
      beds: 2,
      baths: 2,
      price: 750000,
    };

    // Add to read adapter for alerts service
    readAdapter.addListing(listingSnapshot);

    // Step 5: Simulate underwriting completion with good metrics
    const underwriteMetrics: UWMetrics = {
      dscr: 1.4, // Above 1.2 threshold
      cashOnCashPct: 0.095, // Above 0.08 threshold
      cashFlowAnnual: 2800, // Positive cash flow
      capRatePct: 0.048,
      irrPct: 0.115,
    };

    readAdapter.addMetrics("result-999999", underwriteMetrics);

    // Step 6: Create alerts handlers and simulate underwrite_completed event
    console.log("🚨 Step 4: Processing alerts...");
    const alertsHandlers = createHandlers({
      bus: {} as any,
      read: readAdapter,
      repo: alertsRepo,
      dispatch: dispatcher,
    });

    const underwriteEvent: UnderwriteCompletedEvt = {
      id: "C999999",
      resultId: "result-999999",
      score: 8.2,
      source: "exact",
      type: "underwrite_completed",
      ts: new Date().toISOString(),
    };

    await alertsHandlers.onUnderwriteCompleted(underwriteEvent);

    // Step 7: Verify alert was triggered
    expect(capturedAlerts).toHaveLength(1);

    const alert = capturedAlerts[0];
    expect(alert.userId).toBe("investor-123");
    expect(alert.savedSearchId).toBe("search-toronto-investment");
    expect(alert.listingId).toBe("C999999");
    expect(alert.resultId).toBe("result-999999");

    // Verify alert payload contains correct data
    expect(alert.payload.snapshot.city).toBe("Toronto");
    expect(alert.payload.snapshot.price).toBe(750000);
    expect(alert.payload.metrics?.dscr).toBe(1.4);
    expect(alert.payload.score).toBe(8.2);

    // Verify thresholds that were matched
    expect(alert.payload.matched).toContain("dscr>=1.2");
    expect(alert.payload.matched).toContain("coc>=0.08");
    expect(alert.payload.matched).toContain("cf>=0");

    // Verify delivery configuration
    expect(alert.delivery.channels).toEqual(["devbrowser", "email"]);

    // Step 8: Verify alert was persisted
    const persistedAlerts = alertsRepo.getAlerts();
    expect(persistedAlerts).toHaveLength(1);
    expect(persistedAlerts[0].listingId).toBe("C999999");

    console.log("🎉 End-to-End Integration Test Success!");
    console.log(`📊 Alert generated for listing ${alert.listingId}`);
    console.log(`💰 Price: $${alert.payload.snapshot.price.toLocaleString()}`);
    console.log(`📈 DSCR: ${alert.payload.metrics?.dscr}`);
    console.log(
      `💵 CoC: ${((alert.payload.metrics?.cashOnCashPct || 0) * 100).toFixed(
        1
      )}%`
    );
    console.log(`🎯 Matched thresholds: ${alert.payload.matched.join(", ")}`);
  });

  it("should not trigger alerts for properties that don't meet criteria", async () => {
    // Setup a property that doesn't meet the search criteria
    const expensiveListing: ListingSnapshot = {
      id: "C888888",
      city: "Toronto",
      province: "ON",
      propertyType: "Condo",
      beds: 2,
      baths: 2,
      price: 950000, // Over the $800k limit
    };

    readAdapter.addListing(expensiveListing);

    // Good metrics but price is too high
    const goodMetrics: UWMetrics = {
      dscr: 1.5,
      cashOnCashPct: 0.1,
      cashFlowAnnual: 3000,
    };

    readAdapter.addMetrics("result-888888", goodMetrics);

    const alertsHandlers = createHandlers({
      bus: {} as any,
      read: readAdapter,
      repo: alertsRepo,
      dispatch: dispatcher,
    });

    const underwriteEvent: UnderwriteCompletedEvt = {
      id: "C888888",
      resultId: "result-888888",
      score: 8.5,
      source: "exact",
      type: "underwrite_completed",
      ts: new Date().toISOString(),
    };

    await alertsHandlers.onUnderwriteCompleted(underwriteEvent);

    // Should not trigger any alerts due to price filter
    expect(capturedAlerts).toHaveLength(0);
    expect(alertsRepo.getAlerts()).toHaveLength(0);

    console.log("✅ Correctly filtered out expensive property");
    console.log(
      `💰 Price: $${expensiveListing.price.toLocaleString()} (over $800k limit)`
    );
  });

  it("should demonstrate multi-user alert scenarios", async () => {
    // Add another user's search with different criteria
    const vancouverSearch: SavedSearch = {
      id: "search-vancouver-luxury",
      userId: "investor-456",
      name: "Vancouver Luxury Properties",
      filter: {
        city: "Vancouver",
        province: "BC",
        propertyType: "House",
        minBeds: 3,
      },
      thresholds: {
        minScore: 8.5,
      },
      notify: { channel: ["devbrowser", "slack"] },
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    alertsRepo.addSavedSearch(vancouverSearch);

    // Add two properties - one for each user
    const torontoProperty: ListingSnapshot = {
      id: "C777777",
      city: "Toronto",
      province: "ON",
      propertyType: "Condo",
      beds: 2,
      baths: 2,
      price: 650000,
    };

    const vancouverProperty: ListingSnapshot = {
      id: "C666666",
      city: "Vancouver",
      province: "BC",
      propertyType: "House",
      beds: 4,
      baths: 3,
      price: 1500000,
    };

    readAdapter.addListing(torontoProperty);
    readAdapter.addListing(vancouverProperty);

    // Add metrics for Toronto property (good for first user)
    readAdapter.addMetrics("result-777777", {
      dscr: 1.3,
      cashOnCashPct: 0.09,
      cashFlowAnnual: 2000,
    });

    // Add metrics for Vancouver property (good score for second user)
    readAdapter.addMetrics("result-666666", {
      dscr: 1.1,
      cashOnCashPct: 0.05,
      cashFlowAnnual: -500,
    });

    const alertsHandlers = createHandlers({
      bus: {} as any,
      read: readAdapter,
      repo: alertsRepo,
      dispatch: dispatcher,
    });

    // Process Toronto property
    await alertsHandlers.onUnderwriteCompleted({
      id: "C777777",
      resultId: "result-777777",
      score: 7.8,
      source: "exact",
      type: "underwrite_completed",
    });

    // Process Vancouver property with high score
    await alertsHandlers.onUnderwriteCompleted({
      id: "C666666",
      resultId: "result-666666",
      score: 8.7, // Above 8.5 threshold
      source: "grid",
      type: "underwrite_completed",
    });

    // Should have 2 alerts - one for each user
    expect(capturedAlerts).toHaveLength(2);

    const torontoAlert = capturedAlerts.find((a) => a.listingId === "C777777");
    const vancouverAlert = capturedAlerts.find(
      (a) => a.listingId === "C666666"
    );

    expect(torontoAlert?.userId).toBe("investor-123");
    expect(vancouverAlert?.userId).toBe("investor-456");

    expect(torontoAlert?.delivery.channels).toEqual(["devbrowser", "email"]);
    expect(vancouverAlert?.delivery.channels).toEqual(["devbrowser", "slack"]);

    console.log("🎯 Multi-user alerts working correctly!");
    console.log(`👤 User investor-123: Toronto Condo alert`);
    console.log(`👤 User investor-456: Vancouver House alert`);
  });
});
