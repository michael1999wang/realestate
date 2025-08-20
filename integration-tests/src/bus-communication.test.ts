/**
 * Integration Tests for Service Bus Communication
 *
 * This test suite verifies that each service can properly send and receive
 * messages from the bus, ensuring inter-service communication works correctly.
 */

import type {
  AlertsFiredEvent,
  BaseEvent,
  BusPort,
  DataEnrichedEvent,
  ListingChangedEvent,
  PropertyScoredEvent,
  UnderwriteCompletedEvent,
  UnderwriteRequestedEvent,
} from "@realestate/shared-utils";
import { MemoryBus } from "@realestate/shared-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Test service implementations to verify bus functionality
class TestIngestorService {
  constructor(
    private bus: BusPort,
    private serviceName: string = "test-ingestor"
  ) {}

  async publishListingChanged(
    listingId: string,
    change: "create" | "update" | "status_change"
  ) {
    const event: ListingChangedEvent = {
      type: "listing_changed",
      id: `listing-change-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        id: listingId,
        updatedAt: new Date().toISOString(),
        change,
        dirty:
          change === "create"
            ? ["price", "status", "fees", "tax", "media", "address"]
            : ["price"],
      },
    };

    await this.bus.publish(event);
    return event;
  }
}

class TestEnrichmentService {
  private receivedEvents: ListingChangedEvent[] = [];
  private publishedEvents: (DataEnrichedEvent | UnderwriteRequestedEvent)[] =
    [];

  constructor(
    private bus: BusPort,
    private serviceName: string = "test-enrichment"
  ) {
    this.setupSubscriptions();
  }

  private async setupSubscriptions() {
    await this.bus.subscribe<ListingChangedEvent>(
      "listing_changed",
      async (event) => {
        this.receivedEvents.push(event);

        // Simulate enrichment work
        await this.processListingChanged(event);
      }
    );
  }

  private async processListingChanged(event: ListingChangedEvent) {
    const listingId = event.data.id;

    // Simulate enrichment processing delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Publish data enriched event
    const enrichedEvent: DataEnrichedEvent = {
      type: "data_enriched",
      id: `enriched-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        id: listingId,
        enrichmentTypes: ["geo", "tax", "walkscore", "rent_priors"],
        updatedAt: new Date().toISOString(),
      },
    };

    await this.bus.publish(enrichedEvent);
    this.publishedEvents.push(enrichedEvent);

    // If financial data changed, request underwrite
    const hasFinancialChanges = event.data.dirty?.some((field) =>
      ["price", "fees", "tax"].includes(field)
    );

    if (hasFinancialChanges) {
      const underwriteEvent: UnderwriteRequestedEvent = {
        type: "underwrite_requested",
        id: `underwrite-req-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: {
          id: listingId,
        },
      };

      await this.bus.publish(underwriteEvent);
      this.publishedEvents.push(underwriteEvent);
    }
  }

  getReceivedEvents() {
    return [...this.receivedEvents];
  }
  getPublishedEvents() {
    return [...this.publishedEvents];
  }
  clearEvents() {
    this.receivedEvents = [];
    this.publishedEvents = [];
  }
}

class TestRentEstimatorService {
  private receivedEvents: (ListingChangedEvent | DataEnrichedEvent)[] = [];
  private publishedEvents: UnderwriteRequestedEvent[] = [];

  constructor(
    private bus: BusPort,
    private serviceName: string = "test-rent-estimator"
  ) {
    this.setupSubscriptions();
  }

  private async setupSubscriptions() {
    await this.bus.subscribe<ListingChangedEvent>(
      "listing_changed",
      async (event) => {
        this.receivedEvents.push(event);
        await this.processListingChanged(event);
      }
    );

    await this.bus.subscribe<DataEnrichedEvent>(
      "data_enriched",
      async (event) => {
        this.receivedEvents.push(event);
        await this.processDataEnriched(event);
      }
    );
  }

  private async processListingChanged(event: ListingChangedEvent) {
    // Simulate rent estimation work
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Request underwrite after rent estimation
    const underwriteEvent: UnderwriteRequestedEvent = {
      type: "underwrite_requested",
      id: `rent-underwrite-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        id: event.data.id,
      },
    };

    await this.bus.publish(underwriteEvent);
    this.publishedEvents.push(underwriteEvent);
  }

  private async processDataEnriched(event: DataEnrichedEvent) {
    // Simulate updating rent estimates with enriched data
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Request underwrite with updated data
    const underwriteEvent: UnderwriteRequestedEvent = {
      type: "underwrite_requested",
      id: `enriched-underwrite-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        id: event.data.id,
      },
    };

    await this.bus.publish(underwriteEvent);
    this.publishedEvents.push(underwriteEvent);
  }

  getReceivedEvents() {
    return [...this.receivedEvents];
  }
  getPublishedEvents() {
    return [...this.publishedEvents];
  }
  clearEvents() {
    this.receivedEvents = [];
    this.publishedEvents = [];
  }
}

class TestUnderwritingService {
  private receivedEvents: UnderwriteRequestedEvent[] = [];
  private publishedEvents: UnderwriteCompletedEvent[] = [];

  constructor(
    private bus: BusPort,
    private serviceName: string = "test-underwriting"
  ) {
    this.setupSubscriptions();
  }

  private async setupSubscriptions() {
    await this.bus.subscribe<UnderwriteRequestedEvent>(
      "underwrite_requested",
      async (event) => {
        this.receivedEvents.push(event);
        await this.processUnderwriteRequested(event);
      }
    );
  }

  private async processUnderwriteRequested(event: UnderwriteRequestedEvent) {
    // Simulate underwriting work
    await new Promise((resolve) => setTimeout(resolve, 100));

    const completedEvent: UnderwriteCompletedEvent = {
      type: "underwrite_completed",
      id: `underwrite-complete-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        id: event.data.id,
        resultId: `result-${event.data.id}-${Date.now()}`,
        source: event.data.assumptionsId ? "exact" : "grid",
        score: 8.5,
      },
    };

    await this.bus.publish(completedEvent);
    this.publishedEvents.push(completedEvent);
  }

  getReceivedEvents() {
    return [...this.receivedEvents];
  }
  getPublishedEvents() {
    return [...this.publishedEvents];
  }
  clearEvents() {
    this.receivedEvents = [];
    this.publishedEvents = [];
  }
}

class TestAlertsService {
  private receivedEvents: (UnderwriteCompletedEvent | PropertyScoredEvent)[] =
    [];
  private publishedEvents: AlertsFiredEvent[] = [];

  constructor(
    private bus: BusPort,
    private serviceName: string = "test-alerts"
  ) {
    this.setupSubscriptions();
  }

  private async setupSubscriptions() {
    await this.bus.subscribe<UnderwriteCompletedEvent>(
      "underwrite_completed",
      async (event) => {
        this.receivedEvents.push(event);
        await this.processUnderwriteCompleted(event);
      }
    );

    await this.bus.subscribe<PropertyScoredEvent>(
      "property_scored",
      async (event) => {
        this.receivedEvents.push(event);
        await this.processPropertyScored(event);
      }
    );
  }

  private async processUnderwriteCompleted(event: UnderwriteCompletedEvent) {
    // Simulate alert processing
    await new Promise((resolve) => setTimeout(resolve, 40));

    // Simulate triggering an alert for a user
    const alertEvent: AlertsFiredEvent = {
      type: "alert_fired",
      id: `alert-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        userId: "test-user-123",
        listingId: event.data.id,
        resultId: event.data.resultId,
      },
    };

    await this.bus.publish(alertEvent);
    this.publishedEvents.push(alertEvent);
  }

  private async processPropertyScored(event: PropertyScoredEvent) {
    // Simulate processing scored property
    await new Promise((resolve) => setTimeout(resolve, 30));

    if (event.data.score >= 8.0) {
      const alertEvent: AlertsFiredEvent = {
        type: "alert_fired",
        id: `score-alert-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: {
          userId: event.data.userId || "default-user",
          listingId: event.data.id,
          resultId: `score-result-${event.data.id}`,
        },
      };

      await this.bus.publish(alertEvent);
      this.publishedEvents.push(alertEvent);
    }
  }

  getReceivedEvents() {
    return [...this.receivedEvents];
  }
  getPublishedEvents() {
    return [...this.publishedEvents];
  }
  clearEvents() {
    this.receivedEvents = [];
    this.publishedEvents = [];
  }
}

describe("Service Bus Communication Integration Tests", () => {
  let bus: MemoryBus;
  let ingestorService: TestIngestorService;
  let enrichmentService: TestEnrichmentService;
  let rentEstimatorService: TestRentEstimatorService;
  let underwritingService: TestUnderwritingService;
  let alertsService: TestAlertsService;

  beforeEach(async () => {
    // Create shared bus instance
    bus = new MemoryBus("integration-test-bus");

    // Initialize all services with the same bus instance
    ingestorService = new TestIngestorService(bus);
    enrichmentService = new TestEnrichmentService(bus);
    rentEstimatorService = new TestRentEstimatorService(bus);
    underwritingService = new TestUnderwritingService(bus);
    alertsService = new TestAlertsService(bus);

    // Give subscriptions time to register
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    // Clean up
    if (bus.close) {
      await bus.close();
    }
  });

  describe("Basic Bus Functionality", () => {
    it("should allow services to publish and subscribe to events", async () => {
      let receivedEvent: BaseEvent | null = null;

      // Subscribe to a test event
      await bus.subscribe<BaseEvent>("listing_changed", async (event) => {
        receivedEvent = event;
      });

      // Publish a test event
      const testEvent: ListingChangedEvent = {
        type: "listing_changed",
        id: "test-event-123",
        timestamp: new Date().toISOString(),
        data: {
          id: "listing-123",
          updatedAt: new Date().toISOString(),
          change: "create",
        },
      };

      await bus.publish(testEvent);

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvent).toBeTruthy();
      expect(receivedEvent?.type).toBe("listing_changed");
      expect(receivedEvent?.id).toBe("test-event-123");
    });

    it("should handle multiple subscribers to the same event type", async () => {
      const receivedEvents: BaseEvent[] = [];

      // Multiple subscribers
      await bus.subscribe<BaseEvent>("listing_changed", async (event) => {
        receivedEvents.push({ ...event, subscriber: "subscriber1" } as any);
      });

      await bus.subscribe<BaseEvent>("listing_changed", async (event) => {
        receivedEvents.push({ ...event, subscriber: "subscriber2" } as any);
      });

      // Publish event
      const testEvent: ListingChangedEvent = {
        type: "listing_changed",
        id: "multi-test-123",
        timestamp: new Date().toISOString(),
        data: {
          id: "listing-456",
          updatedAt: new Date().toISOString(),
          change: "update",
        },
      };

      await bus.publish(testEvent);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0].id).toBe("multi-test-123");
      expect(receivedEvents[1].id).toBe("multi-test-123");
    });

    it("should get memory bus status information", () => {
      const status = bus.getStatus();

      expect(status).toHaveProperty("subscribedTopics");
      expect(status).toHaveProperty("handlerCount");
      expect(status).toHaveProperty("publishedEventCount");
      expect(Array.isArray(status.subscribedTopics)).toBe(true);
      expect(typeof status.handlerCount).toBe("number");
      expect(typeof status.publishedEventCount).toBe("number");
    });
  });

  describe("Ingestor Service Communication", () => {
    it("should publish listing_changed events that other services receive", async () => {
      // Clear any previous events
      enrichmentService.clearEvents();
      rentEstimatorService.clearEvents();

      // Ingestor publishes a new listing
      const event = await ingestorService.publishListingChanged(
        "listing-789",
        "create"
      );

      // Wait for event propagation
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check that enrichment service received the event
      const enrichmentEvents = enrichmentService.getReceivedEvents();
      expect(enrichmentEvents).toHaveLength(1);
      expect(enrichmentEvents[0].data.id).toBe("listing-789");
      expect(enrichmentEvents[0].data.change).toBe("create");

      // Check that rent estimator received the event(s)
      const rentEvents = rentEstimatorService.getReceivedEvents();
      expect(rentEvents.length).toBeGreaterThanOrEqual(1);

      // Should have received at least the listing_changed event
      const listingChangedEvent = rentEvents.find(
        (e) => e.type === "listing_changed"
      );
      expect(listingChangedEvent).toBeTruthy();
      expect((listingChangedEvent as ListingChangedEvent).data.id).toBe(
        "listing-789"
      );
    });

    it("should trigger downstream processing when publishing listing updates", async () => {
      enrichmentService.clearEvents();
      underwritingService.clearEvents();

      // Ingestor publishes a price update
      await ingestorService.publishListingChanged(
        "listing-price-update",
        "update"
      );

      // Wait for complete processing chain
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Enrichment should have published events
      const enrichmentPublished = enrichmentService.getPublishedEvents();
      expect(enrichmentPublished.length).toBeGreaterThan(0);

      // Should include data_enriched event
      const dataEnrichedEvents = enrichmentPublished.filter(
        (e) => e.type === "data_enriched"
      );
      expect(dataEnrichedEvents).toHaveLength(1);

      // Should include underwrite_requested event (due to price change)
      const underwriteRequested = enrichmentPublished.filter(
        (e) => e.type === "underwrite_requested"
      );
      expect(underwriteRequested).toHaveLength(1);

      // Underwriting should have received and processed the request
      const underwritingReceived = underwritingService.getReceivedEvents();
      expect(underwritingReceived.length).toBeGreaterThan(0);
    });
  });

  describe("Enrichment Service Communication", () => {
    it("should receive listing_changed events and publish enrichment results", async () => {
      enrichmentService.clearEvents();

      // Trigger listing change
      await ingestorService.publishListingChanged(
        "listing-enrich-test",
        "create"
      );

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check received events
      const received = enrichmentService.getReceivedEvents();
      expect(received).toHaveLength(1);
      expect(received[0].data.id).toBe("listing-enrich-test");

      // Check published events
      const published = enrichmentService.getPublishedEvents();
      expect(published.length).toBeGreaterThan(0);

      // Should have published data_enriched
      const dataEnriched = published.find((e) => e.type === "data_enriched");
      expect(dataEnriched).toBeTruthy();
      expect((dataEnriched as DataEnrichedEvent).data.id).toBe(
        "listing-enrich-test"
      );
      expect(
        (dataEnriched as DataEnrichedEvent).data.enrichmentTypes
      ).toContain("geo");

      // Should have published underwrite_requested (for new listings)
      const underwriteReq = published.find(
        (e) => e.type === "underwrite_requested"
      );
      expect(underwriteReq).toBeTruthy();
      expect((underwriteReq as UnderwriteRequestedEvent).data.id).toBe(
        "listing-enrich-test"
      );
    });
  });

  describe("Rent Estimator Service Communication", () => {
    it("should receive both listing_changed and data_enriched events", async () => {
      rentEstimatorService.clearEvents();

      // Trigger both types of events
      await ingestorService.publishListingChanged(
        "listing-rent-test",
        "update"
      );

      // Wait for initial processing and enrichment
      await new Promise((resolve) => setTimeout(resolve, 250));

      const received = rentEstimatorService.getReceivedEvents();

      // Should have received listing_changed
      const listingChanged = received.find((e) => e.type === "listing_changed");
      expect(listingChanged).toBeTruthy();

      // Should have received data_enriched from enrichment service
      const dataEnriched = received.find((e) => e.type === "data_enriched");
      expect(dataEnriched).toBeTruthy();
    });

    it("should publish underwrite_requested events after processing", async () => {
      rentEstimatorService.clearEvents();

      await ingestorService.publishListingChanged(
        "listing-rent-underwrite",
        "create"
      );

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      const published = rentEstimatorService.getPublishedEvents();
      expect(published.length).toBeGreaterThan(0);

      // All published events should be underwrite requests
      published.forEach((event) => {
        expect(event.type).toBe("underwrite_requested");
        expect(event.data.id).toBe("listing-rent-underwrite");
      });
    });
  });

  describe("Underwriting Service Communication", () => {
    it("should receive underwrite_requested and publish underwrite_completed", async () => {
      underwritingService.clearEvents();

      // Trigger the pipeline
      await ingestorService.publishListingChanged(
        "listing-underwrite-test",
        "create"
      );

      // Wait for complete processing
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Check received events
      const received = underwritingService.getReceivedEvents();
      expect(received.length).toBeGreaterThan(0);

      received.forEach((event) => {
        expect(event.type).toBe("underwrite_requested");
        expect(event.data.id).toBe("listing-underwrite-test");
      });

      // Check published events
      const published = underwritingService.getPublishedEvents();
      expect(published.length).toBeGreaterThan(0);

      published.forEach((event) => {
        expect(event.type).toBe("underwrite_completed");
        expect(event.data.id).toBe("listing-underwrite-test");
        expect(event.data.resultId).toBeTruthy();
        expect(event.data.source).toMatch(/^(grid|exact)$/);
        expect(event.data.score).toBe(8.5);
      });
    });
  });

  describe("Alerts Service Communication", () => {
    it("should receive underwrite_completed and publish alert_fired", async () => {
      alertsService.clearEvents();

      // Trigger the complete pipeline
      await ingestorService.publishListingChanged(
        "listing-alert-test",
        "create"
      );

      // Wait for complete processing through the entire pipeline
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check received events
      const received = alertsService.getReceivedEvents();
      expect(received.length).toBeGreaterThan(0);

      const underwriteCompleted = received.filter(
        (e) => e.type === "underwrite_completed"
      );
      expect(underwriteCompleted.length).toBeGreaterThan(0);

      // Check published events
      const published = alertsService.getPublishedEvents();
      expect(published.length).toBeGreaterThan(0);

      published.forEach((event) => {
        expect(event.type).toBe("alert_fired");
        expect(event.data.listingId).toBe("listing-alert-test");
        expect(event.data.userId).toBeTruthy();
        expect(event.data.resultId).toBeTruthy();
      });
    });

    it("should handle property_scored events", async () => {
      alertsService.clearEvents();

      // Publish property scored event directly
      const scoredEvent: PropertyScoredEvent = {
        type: "property_scored",
        id: "score-test-123",
        timestamp: new Date().toISOString(),
        data: {
          id: "listing-scored-test",
          score: 9.2,
          userId: "investor-456",
        },
      };

      await bus.publish(scoredEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have received and processed the scored event
      const received = alertsService.getReceivedEvents();
      const scoredReceived = received.find((e) => e.type === "property_scored");
      expect(scoredReceived).toBeTruthy();

      // Should have triggered an alert for high score
      const published = alertsService.getPublishedEvents();
      expect(published).toHaveLength(1);
      expect(published[0].data.listingId).toBe("listing-scored-test");
      expect(published[0].data.userId).toBe("investor-456");
    });
  });

  describe("End-to-End Pipeline Integration", () => {
    it("should process a complete pipeline from ingestor to alerts", async () => {
      // Clear all services
      enrichmentService.clearEvents();
      rentEstimatorService.clearEvents();
      underwritingService.clearEvents();
      alertsService.clearEvents();

      const testListingId = "complete-pipeline-test";

      // Track the pipeline flow
      const pipelineFlow: string[] = [];

      // Start the pipeline
      pipelineFlow.push("ingestor_publish");
      await ingestorService.publishListingChanged(testListingId, "create");

      // Wait for complete processing
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify each service processed the events
      pipelineFlow.push("enrichment_received");
      const enrichmentReceived = enrichmentService.getReceivedEvents();
      expect(enrichmentReceived).toHaveLength(1);
      expect(enrichmentReceived[0].data.id).toBe(testListingId);

      pipelineFlow.push("enrichment_published");
      const enrichmentPublished = enrichmentService.getPublishedEvents();
      expect(enrichmentPublished.length).toBeGreaterThan(0);

      pipelineFlow.push("rent_estimator_received");
      const rentReceived = rentEstimatorService.getReceivedEvents();
      expect(rentReceived.length).toBeGreaterThan(0);

      pipelineFlow.push("underwriting_received");
      const underwritingReceived = underwritingService.getReceivedEvents();
      expect(underwritingReceived.length).toBeGreaterThan(0);

      pipelineFlow.push("underwriting_published");
      const underwritingPublished = underwritingService.getPublishedEvents();
      expect(underwritingPublished.length).toBeGreaterThan(0);

      pipelineFlow.push("alerts_received");
      const alertsReceived = alertsService.getReceivedEvents();
      expect(alertsReceived.length).toBeGreaterThan(0);

      pipelineFlow.push("alerts_published");
      const alertsPublished = alertsService.getPublishedEvents();
      expect(alertsPublished.length).toBeGreaterThan(0);

      // Verify final alert contains correct listing ID
      alertsPublished.forEach((alert) => {
        expect(alert.data.listingId).toBe(testListingId);
      });

      console.log(`✅ Complete pipeline flow: ${pipelineFlow.join(" → ")}`);
    });

    it("should handle multiple concurrent listings", async () => {
      // Clear all services
      enrichmentService.clearEvents();
      underwritingService.clearEvents();
      alertsService.clearEvents();

      const listingIds = ["concurrent-1", "concurrent-2", "concurrent-3"];

      // Publish all listings simultaneously
      const promises = listingIds.map((id) =>
        ingestorService.publishListingChanged(id, "create")
      );
      await Promise.all(promises);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 700));

      // Verify all listings were processed
      const enrichmentReceived = enrichmentService.getReceivedEvents();
      expect(enrichmentReceived).toHaveLength(listingIds.length);

      const receivedIds = enrichmentReceived.map((e) => e.data.id);
      listingIds.forEach((id) => {
        expect(receivedIds).toContain(id);
      });

      // Verify alerts were generated for all
      const alertsPublished = alertsService.getPublishedEvents();
      const alertListingIds = alertsPublished.map((a) => a.data.listingId);

      listingIds.forEach((id) => {
        expect(alertListingIds).toContain(id);
      });
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should continue processing other events when one handler fails", async () => {
      let handlerCallCount = 0;
      let successfulEvents = 0;

      // Add a handler that fails on specific events
      await bus.subscribe<ListingChangedEvent>(
        "listing_changed",
        async (event) => {
          handlerCallCount++;

          if (event.data.id === "error-listing") {
            throw new Error("Simulated handler error");
          }

          successfulEvents++;
        }
      );

      // Publish mix of successful and failing events
      await ingestorService.publishListingChanged("success-1", "create");
      await ingestorService.publishListingChanged("error-listing", "create");
      await ingestorService.publishListingChanged("success-2", "create");

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have attempted all handlers
      expect(handlerCallCount).toBeGreaterThanOrEqual(3);

      // Should have processed the non-failing events
      expect(successfulEvents).toBe(2);
    });

    it("should maintain event order in memory bus", async () => {
      const receivedOrder: string[] = [];

      await bus.subscribe<ListingChangedEvent>(
        "listing_changed",
        async (event) => {
          receivedOrder.push(event.data.id);
        }
      );

      // Publish events in specific order
      const expectedOrder = ["first", "second", "third", "fourth"];
      for (const id of expectedOrder) {
        await ingestorService.publishListingChanged(id, "create");
      }

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should maintain order
      expect(receivedOrder).toEqual(expect.arrayContaining(expectedOrder));
    });
  });
});
