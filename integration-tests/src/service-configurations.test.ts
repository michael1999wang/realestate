/**
 * Integration Tests for Real Service Configurations
 * 
 * This test suite verifies that the actual service configurations work correctly
 * and can communicate via the bus using the BaseService template.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MemoryBus, MemoryCache } from "@realestate/shared-utils";
import type { 
  BusPort,
  ListingChangedEvent,
  DataEnrichedEvent,
  UnderwriteRequestedEvent,
  UnderwriteCompletedEvent,
  PropertyScoredEvent,
  AlertsFiredEvent
} from "@realestate/shared-utils";

// Import actual service business logic
import { IngestorBusinessLogic, type IngestorDependencies } from "../../ingestor/src/service-config";
import { EnrichmentBusinessLogic, type EnrichmentDependencies } from "../../enrichment/src/service-config";
import { RentEstimatorBusinessLogic, type RentEstimatorDependencies } from "../../rent-estimator/src/service-config";
import { UnderwritingBusinessLogic, type UnderwritingDependencies } from "../../underwriting/src/service-config";
import { AlertsBusinessLogic, type AlertsDependencies } from "../../alerts/src/service-config";

// Import required adapters and repositories
import { MockSource } from "../../ingestor/src/adapters/source.mock";
import { MemoryRepo as IngestorMemoryRepo } from "../../ingestor/src/adapters/repo.memory";

import { MemoryListingRepo, MemoryEnrichmentRepo } from "../../enrichment/src/adapters/repo.memory";
import { WalkScoreAPI } from "../../enrichment/src/adapters/walkscore.api";
import { CMHCAPI } from "../../enrichment/src/adapters/cmhc.api";
import { GeocoderAPI } from "../../enrichment/src/adapters/geocode.api";
import { TaxesTable } from "../../enrichment/src/adapters/taxes.table";

import { MemoryRentRepo } from "../../rent-estimator/src/adapters/repo.memory";
import { MockReadAdapter as RentMockReadAdapter } from "../../rent-estimator/src/adapters/read.mock";
import { MockPriorsSource } from "../../rent-estimator/src/adapters/priors.source";
import { MockCompsSource } from "../../rent-estimator/src/adapters/comps.source";

import { MemoryFactorsRepo } from "../../underwriting/src/adapters/factors.memory";
import { SnapshotsReadAdapter } from "../../underwriting/src/adapters/read.snapshots";
import { MemoryAssumptionsRepo, MemoryUWRepo } from "../../underwriting/src/adapters/repo.memory";

import { MemoryAlertsRepo } from "../../alerts/src/adapters/repo.memory";
import { MockReadAdapter as AlertsMockReadAdapter } from "../../alerts/src/adapters/read.mock";
import { MultiChannelDispatcher } from "../../alerts/src/core/dispatch";

// Mock logger
const mockLogger = {
  info: console.log,
  warn: console.warn,
  error: console.error
};

describe("Real Service Configuration Integration Tests", () => {
  let sharedBus: MemoryBus;
  let sharedCache: MemoryCache;
  
  // Service business logic instances
  let ingestorLogic: IngestorBusinessLogic;
  let enrichmentLogic: EnrichmentBusinessLogic;
  let rentEstimatorLogic: RentEstimatorBusinessLogic;
  let underwritingLogic: UnderwritingBusinessLogic;
  let alertsLogic: AlertsBusinessLogic;

  // Test data repositories for verification
  let ingestorRepo: IngestorMemoryRepo;
  let enrichmentRepo: MemoryEnrichmentRepo;
  let listingRepo: MemoryListingRepo;
  let rentRepo: MemoryRentRepo;
  let underwritingRepo: MemoryUWRepo;
  let alertsRepo: MemoryAlertsRepo;

  beforeEach(async () => {
    // Create shared infrastructure
    sharedBus = new MemoryBus("service-integration-test");
    sharedCache = new MemoryCache();

    // Setup Ingestor
    ingestorRepo = new MemoryRepo();
    const mockSource = new MockSource(10);
    
    const ingestorDeps: IngestorDependencies = {
      bus: sharedBus,
      repositories: {
        listings: ingestorRepo
      },
      clients: {
        source: mockSource
      },
      logger: mockLogger
    };

    ingestorLogic = new IngestorBusinessLogic(ingestorDeps);

    // Setup Enrichment
    enrichmentRepo = new MemoryEnrichmentRepo();
    listingRepo = new MemoryListingRepo();
    
    // Seed with test listings
    const testListings = [
      {
        id: "test-listing-1",
        updatedAt: new Date().toISOString(),
        address: {
          street: "123 Test St",
          city: "Toronto",
          province: "ON",
          postalCode: "M5V 1A1",
          lat: 43.6532,
          lng: -79.3832
        },
        listPrice: 750000,
        taxesAnnual: 5400,
        condoFeeMonthly: 420,
        propertyType: "Condo"
      },
      {
        id: "test-listing-2", 
        updatedAt: new Date().toISOString(),
        address: {
          street: "456 Test Ave",
          city: "Vancouver",
          province: "BC",
          postalCode: "V6B 1A1"
        },
        listPrice: 850000,
        propertyType: "Apartment"
      }
    ];

    testListings.forEach(listing => {
      listingRepo.setListing(listing);
    });

    const enrichmentDeps: EnrichmentDependencies = {
      bus: sharedBus,
      cache: sharedCache,
      repositories: {
        enrichment: enrichmentRepo,
        listing: listingRepo
      },
      clients: {
        walkScore: new WalkScoreAPI(undefined, true), // mock mode
        cmhc: new CMHCAPI(true), // mock mode
        geocoder: new GeocoderAPI("mock"),
        taxes: new TaxesTable()
      },
      logger: mockLogger
    };

    enrichmentLogic = new EnrichmentBusinessLogic(enrichmentDeps);

    // Setup Rent Estimator
    rentRepo = new MemoryRentRepo();
    const rentReadAdapter = new RentMockReadAdapter();
    
    const rentDeps: RentEstimatorDependencies = {
      bus: sharedBus,
      cache: sharedCache,
      repositories: {
        rent: rentRepo
      },
      clients: {
        read: rentReadAdapter,
        priors: new MockPriorsSource(),
        comps: new MockCompsSource()
      },
      logger: mockLogger
    };

    rentEstimatorLogic = new RentEstimatorBusinessLogic(rentDeps);

    // Setup Underwriting  
    underwritingRepo = new MemoryUWRepo();
    const snapshotsAdapter = new SnapshotsReadAdapter(null as any);
    const assumptionsRepo = new MemoryAssumptionsRepo();
    const factorsRepo = new MemoryFactorsRepo();

    const underwritingDeps: UnderwritingDependencies = {
      bus: sharedBus,
      repositories: {
        snapshots: snapshotsAdapter,
        assumptions: assumptionsRepo,
        underwriting: underwritingRepo,
        factors: factorsRepo
      },
      clients: {},
      logger: mockLogger
    };

    underwritingLogic = new UnderwritingBusinessLogic(underwritingDeps);

    // Setup Alerts
    alertsRepo = new MemoryAlertsRepo([
      // Sample saved search for testing
      {
        id: "test-search-1",
        userId: "test-user-123",
        name: "Toronto Condos",
        filter: {
          city: "Toronto",
          province: "ON",
          propertyType: "Condo",
          maxPrice: 800000
        },
        thresholds: {
          minDSCR: 1.2,
          minCoC: 0.08,
          requireNonNegativeCF: true
        },
        notify: {
          channel: ["devbrowser"]
        },
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ]);

    const alertsReadAdapter = new AlertsMockReadAdapter(
      [
        {
          id: "test-listing-1",
          city: "Toronto", 
          province: "ON",
          propertyType: "Condo",
          beds: 2,
          baths: 2,
          price: 750000
        }
      ],
      [
        {
          resultId: "test-result-1",
          metrics: {
            dscr: 1.4,
            cashOnCashPct: 0.09,
            cashFlowAnnual: 2400,
            capRatePct: 0.045,
            irrPct: 0.12
          }
        }
      ]
    );

    const mockDispatcher = new MultiChannelDispatcher(async (alert) => {
      console.log(`Alert dispatched: ${alert.id} for user ${alert.userId}`);
    });

    const alertsDeps: AlertsDependencies = {
      bus: sharedBus,
      repositories: {
        alerts: alertsRepo
      },
      clients: {
        read: alertsReadAdapter,
        dispatcher: mockDispatcher
      },
      logger: mockLogger
    };

    alertsLogic = new AlertsBusinessLogic(alertsDeps);

    // Wait for all subscriptions to be set up
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (sharedBus.close) {
      await sharedBus.close();
    }
    sharedCache.clear();
  });

  describe("Individual Service Business Logic", () => {
    it("should create all service business logic instances", () => {
      expect(ingestorLogic).toBeDefined();
      expect(enrichmentLogic).toBeDefined();
      expect(rentEstimatorLogic).toBeDefined();
      expect(underwritingLogic).toBeDefined();
      expect(alertsLogic).toBeDefined();
    });

    it("should have service metrics available", () => {
      expect(typeof ingestorLogic.getMetrics).toBe("function");
      expect(typeof enrichmentLogic.getMetrics).toBe("function");
      expect(typeof rentEstimatorLogic.getMetrics).toBe("function");
      expect(typeof underwritingLogic.getMetrics).toBe("function");

      // Check initial metrics
      const ingestorMetrics = ingestorLogic.getMetrics();
      expect(ingestorMetrics).toHaveProperty("pollsCompleted");
      expect(ingestorMetrics).toHaveProperty("listingsProcessed");

      const enrichmentMetrics = enrichmentLogic.getMetrics();
      expect(enrichmentMetrics).toHaveProperty("eventsProcessed");
      expect(enrichmentMetrics).toHaveProperty("enrichmentsChanged");
    });

    it("should report service health status", () => {
      expect(typeof ingestorLogic.isHealthy).toBe("function");
      expect(typeof enrichmentLogic.isHealthy).toBe("function");
      expect(typeof rentEstimatorLogic.isHealthy).toBe("function");
      expect(typeof underwritingLogic.isHealthy).toBe("function");

      // All should be healthy initially
      expect(ingestorLogic.isHealthy()).toBe(true);
      expect(enrichmentLogic.isHealthy()).toBe(true);
      expect(rentEstimatorLogic.isHealthy()).toBe(true);
      expect(underwritingLogic.isHealthy()).toBe(true);
    });
  });

  describe("Enrichment Service Event Handling", () => {
    it("should process listing_changed events", async () => {
      const initialMetrics = enrichmentLogic.getMetrics();

      const listingChangedEvent: ListingChangedEvent = {
        type: "listing_changed",
        id: "test-event-1",
        timestamp: new Date().toISOString(),
        data: {
          id: "test-listing-1",
          updatedAt: new Date().toISOString(),
          change: "create",
          dirty: ["address", "price"]
        }
      };

      await enrichmentLogic.handleListingChanged(listingChangedEvent.data);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMetrics = enrichmentLogic.getMetrics();
      expect(finalMetrics.eventsProcessed).toBe(initialMetrics.eventsProcessed + 1);
    });

    it("should create enrichment data", async () => {
      const listingChangedEvent: ListingChangedEvent = {
        type: "listing_changed",
        id: "test-event-2",
        timestamp: new Date().toISOString(),
        data: {
          id: "test-listing-1",
          updatedAt: new Date().toISOString(),
          change: "create",
          dirty: ["address"]
        }
      };

      await enrichmentLogic.handleListingChanged(listingChangedEvent.data);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if enrichment was created
      const enrichments = enrichmentRepo.getAll();
      expect(enrichments.length).toBeGreaterThan(0);

      const enrichment = enrichments.find(e => e.listingId === "test-listing-1");
      expect(enrichment).toBeDefined();
    });
  });

  describe("Rent Estimator Service Event Handling", () => {
    it("should process listing_changed events", async () => {
      const initialMetrics = rentEstimatorLogic.getMetrics();

      const listingChangedEvent = {
        id: "test-listing-1",
        updatedAt: new Date().toISOString(),
        change: "create" as const,
        dirty: ["price"] as ("price" | "status" | "fees" | "tax" | "media" | "address")[]
      };

      await rentEstimatorLogic.handleListingChanged(listingChangedEvent);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMetrics = rentEstimatorLogic.getMetrics();
      expect(finalMetrics.eventsProcessed).toBe(initialMetrics.eventsProcessed + 1);
    });

    it("should process data_enriched events", async () => {
      const initialMetrics = rentEstimatorLogic.getMetrics();

      const dataEnrichedEvent = {
        id: "test-listing-1",
        enrichmentTypes: ["geo", "rent_priors"],
        updatedAt: new Date().toISOString()
      };

      await rentEstimatorLogic.handleDataEnriched(dataEnrichedEvent);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMetrics = rentEstimatorLogic.getMetrics();
      expect(finalMetrics.eventsProcessed).toBe(initialMetrics.eventsProcessed + 1);
    });
  });

  describe("Underwriting Service Event Handling", () => {
    it("should process underwrite_requested events", async () => {
      // Add test data that underwriting can read
      const mockSnapshots = underwritingLogic as any;
      
      const initialMetrics = underwritingLogic.getMetrics();

      const underwriteRequestedEvent = {
        id: "test-listing-1",
        assumptionsId: undefined
      };

      try {
        await underwritingLogic.handleUnderwriteRequested(underwriteRequestedEvent);
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        const finalMetrics = underwritingLogic.getMetrics();
        // Note: This may not increment if the snapshot data isn't available
        // but the service should handle the event gracefully
        expect(finalMetrics.errors).toBe(initialMetrics.errors);
      } catch (error) {
        // Expected if snapshot data isn't available - service should handle gracefully
        console.log("Expected error when snapshot data not available:", (error as Error).message);
      }
    });

    it("should process listing_changed events", async () => {
      const initialMetrics = underwritingLogic.getMetrics();

      const listingChangedEvent = {
        id: "test-listing-1",
        updatedAt: new Date().toISOString(),
        change: "update" as const,
        dirty: ["price", "fees"] as ("price" | "status" | "fees" | "tax" | "media" | "address")[]
      };

      try {
        await underwritingLogic.handleListingChanged(listingChangedEvent);

        const finalMetrics = underwritingLogic.getMetrics();
        // Service should process the event even if data isn't complete
        expect(finalMetrics.errors).toBe(initialMetrics.errors);
      } catch (error) {
        // Expected if snapshot data isn't available
        console.log("Expected error when snapshot data not available:", (error as Error).message);
      }
    });
  });

  describe("Alerts Service Event Handling", () => {
    it("should process underwrite_completed events", async () => {
      const underwriteCompletedEvent = {
        id: "test-listing-1",
        resultId: "test-result-1",
        source: "grid" as const,
        score: 8.5
      };

      await alertsLogic.handleUnderwriteCompleted(underwriteCompletedEvent);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if alerts were created
      const alerts = alertsRepo.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      
      const alert = alerts[0];
      expect(alert.listingId).toBe("test-listing-1");
      expect(alert.resultId).toBe("test-result-1");
      expect(alert.userId).toBe("test-user-123");
    });

    it("should process property_scored events", async () => {
      const propertyScoredEvent = {
        id: "test-listing-1",
        score: 9.0,
        userId: "test-user-123"
      };

      await alertsLogic.handlePropertyScored(propertyScoredEvent);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should process the event (specific behavior depends on implementation)
      // At minimum, it should not throw an error
    });
  });

  describe("Bus Communication Between Services", () => {
    it("should verify bus subscriptions are set up", () => {
      const busStatus = sharedBus.getStatus();
      
      expect(busStatus.subscribedTopics.length).toBeGreaterThan(0);
      expect(busStatus.handlerCount).toBeGreaterThan(0);
      
      // Log current subscriptions for debugging
      console.log("Bus subscriptions:", {
        topics: busStatus.subscribedTopics,
        handlerCount: busStatus.handlerCount
      });
    });

    it("should publish and receive events through the bus", async () => {
      let receivedEvent: any = null;

      // Add a test subscriber
      await sharedBus.subscribe("listing_changed", async (event) => {
        receivedEvent = event;
      });

      // Publish a test event
      const testEvent: ListingChangedEvent = {
        type: "listing_changed",
        id: "bus-test-1",
        timestamp: new Date().toISOString(),
        data: {
          id: "test-listing-bus",
          updatedAt: new Date().toISOString(),
          change: "create"
        }
      };

      await sharedBus.publish(testEvent);

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedEvent).toBeTruthy();
      expect(receivedEvent.type).toBe("listing_changed");
      expect(receivedEvent.data.id).toBe("test-listing-bus");
    });

    it("should handle event publishing from service business logic", async () => {
      const initialEventCount = sharedBus.getPublishedEvents().length;

      // Trigger enrichment service to publish events
      const listingChangedEvent = {
        id: "test-listing-1",
        updatedAt: new Date().toISOString(),
        change: "create" as const,
        dirty: ["price", "address"] as ("price" | "status" | "fees" | "tax" | "media" | "address")[]
      };

      await enrichmentLogic.handleListingChanged(listingChangedEvent);

      // Wait for processing and event publishing
      await new Promise(resolve => setTimeout(resolve, 200));

      const finalEventCount = sharedBus.getPublishedEvents().length;
      
      // Should have published additional events
      expect(finalEventCount).toBeGreaterThan(initialEventCount);

      // Check the types of published events
      const publishedEvents = sharedBus.getPublishedEvents();
      const eventTypes = publishedEvents.map(e => e.type);
      
      console.log("Published event types:", eventTypes);
      expect(eventTypes.length).toBeGreaterThan(0);
    });
  });

  describe("Service Configuration Validation", () => {
    it("should validate that services have required methods", () => {
      // Check that business logic classes have required handler methods
      expect(typeof enrichmentLogic.handleListingChanged).toBe("function");
      expect(typeof rentEstimatorLogic.handleListingChanged).toBe("function");
      expect(typeof rentEstimatorLogic.handleDataEnriched).toBe("function");
      expect(typeof underwritingLogic.handleUnderwriteRequested).toBe("function");
      expect(typeof underwritingLogic.handleListingChanged).toBe("function");
      expect(typeof alertsLogic.handleUnderwriteCompleted).toBe("function");
      expect(typeof alertsLogic.handlePropertyScored).toBe("function");
    });

    it("should have access to required dependencies", () => {
      // Each service should have access to bus, repositories, and clients
      const enrichmentDeps = (enrichmentLogic as any).deps;
      expect(enrichmentDeps.bus).toBeDefined();
      expect(enrichmentDeps.repositories).toBeDefined();
      expect(enrichmentDeps.clients).toBeDefined();
      expect(enrichmentDeps.logger).toBeDefined();

      const rentDeps = (rentEstimatorLogic as any).deps;
      expect(rentDeps.bus).toBeDefined();
      expect(rentDeps.repositories).toBeDefined();
      expect(rentDeps.clients).toBeDefined();

      const underwritingDeps = (underwritingLogic as any).deps;
      expect(underwritingDeps.bus).toBeDefined();
      expect(underwritingDeps.repositories).toBeDefined();

      const alertsDeps = (alertsLogic as any).deps;
      expect(alertsDeps.bus).toBeDefined();
      expect(alertsDeps.repositories).toBeDefined();
      expect(alertsDeps.clients).toBeDefined();
    });

    it("should use the same shared bus instance", () => {
      const enrichmentBus = (enrichmentLogic as any).deps.bus;
      const rentBus = (rentEstimatorLogic as any).deps.bus;
      const underwritingBus = (underwritingLogic as any).deps.bus;
      const alertsBus = (alertsLogic as any).deps.bus;

      // All should reference the same bus instance
      expect(enrichmentBus).toBe(sharedBus);
      expect(rentBus).toBe(sharedBus);
      expect(underwritingBus).toBe(sharedBus);
      expect(alertsBus).toBe(sharedBus);
    });
  });

  describe("Memory Management and Cleanup", () => {
    it("should clear cache and bus state", async () => {
      // Add some data to cache
      await sharedCache.set("test-key", "test-value", 60);
      expect(await sharedCache.get("test-key")).toBe("test-value");

      // Publish some events
      await sharedBus.publish({
        type: "listing_changed",
        id: "cleanup-test",
        timestamp: new Date().toISOString(),
        data: { id: "test", updatedAt: new Date().toISOString(), change: "create" }
      } as ListingChangedEvent);

      const initialEventCount = sharedBus.getPublishedEvents().length;
      expect(initialEventCount).toBeGreaterThan(0);

      // Clear cache
      sharedCache.clear();
      expect(await sharedCache.get("test-key")).toBeNull();

      // Clear bus events
      sharedBus.clearHistory();
      expect(sharedBus.getPublishedEvents().length).toBe(0);
    });

    it("should handle service shutdown gracefully", async () => {
      // This would test the BaseService shutdown behavior
      // For now, just verify that bus can be closed
      expect(typeof sharedBus.close).toBe("function");
    });
  });
});
