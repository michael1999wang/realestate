/**
 * Pipeline Flow Integration Tests
 *
 * Tests the complete message flow through the real estate pipeline:
 * Ingestor → Enrichment → Rent Estimator → Underwriting → Alerts
 */

import type {
  AlertsFiredEvent,
  DataEnrichedEvent,
  ListingChangedEvent,
  UnderwriteCompletedEvent,
  UnderwriteRequestedEvent,
} from "@realestate/shared-utils";
import { MemoryBus } from "@realestate/shared-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Complete Pipeline Flow Integration Tests", () => {
  let sharedBus: MemoryBus;
  let eventLog: Array<{
    timestamp: string;
    service: string;
    event: string;
    data: any;
  }> = [];

  // Service simulation classes that track the full pipeline
  class PipelineIngestorService {
    constructor(private bus: MemoryBus) {}

    async ingestListing(
      listingId: string,
      change: "create" | "update" | "status_change"
    ) {
      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "ingestor",
        event: "publish_listing_changed",
        data: { listingId, change },
      });

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

  class PipelineEnrichmentService {
    constructor(private bus: MemoryBus) {
      this.setupSubscriptions();
    }

    private async setupSubscriptions() {
      await this.bus.subscribe<ListingChangedEvent>(
        "listing_changed",
        async (event) => {
          eventLog.push({
            timestamp: new Date().toISOString(),
            service: "enrichment",
            event: "received_listing_changed",
            data: { listingId: event.data.id },
          });

          await this.processListingChanged(event.data.id, event.data.dirty);
        }
      );
    }

    private async processListingChanged(listingId: string, dirty?: string[]) {
      // Simulate enrichment processing time
      await new Promise((resolve) => setTimeout(resolve, 50));

      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "enrichment",
        event: "processing_complete",
        data: { listingId },
      });

      // Always publish data enriched
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

      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "enrichment",
        event: "published_data_enriched",
        data: { listingId },
      });

      // If financial data changed, request underwrite
      const hasFinancialChanges = dirty?.some((field) =>
        ["price", "fees", "tax"].includes(field)
      );
      if (hasFinancialChanges) {
        const underwriteEvent: UnderwriteRequestedEvent = {
          type: "underwrite_requested",
          id: `underwrite-req-${Date.now()}`,
          timestamp: new Date().toISOString(),
          data: { id: listingId },
        };

        await this.bus.publish(underwriteEvent);

        eventLog.push({
          timestamp: new Date().toISOString(),
          service: "enrichment",
          event: "published_underwrite_requested",
          data: { listingId, reason: "financial_changes" },
        });
      }
    }
  }

  class PipelineRentEstimatorService {
    constructor(private bus: MemoryBus) {
      this.setupSubscriptions();
    }

    private async setupSubscriptions() {
      await this.bus.subscribe<ListingChangedEvent>(
        "listing_changed",
        async (event) => {
          eventLog.push({
            timestamp: new Date().toISOString(),
            service: "rent-estimator",
            event: "received_listing_changed",
            data: { listingId: event.data.id },
          });

          await this.processListingForRentEstimate(event.data.id);
        }
      );

      await this.bus.subscribe<DataEnrichedEvent>(
        "data_enriched",
        async (event) => {
          eventLog.push({
            timestamp: new Date().toISOString(),
            service: "rent-estimator",
            event: "received_data_enriched",
            data: { listingId: event.data.id },
          });

          await this.updateRentEstimate(event.data.id);
        }
      );
    }

    private async processListingForRentEstimate(listingId: string) {
      await new Promise((resolve) => setTimeout(resolve, 40));

      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "rent-estimator",
        event: "rent_estimate_complete",
        data: { listingId },
      });

      // Request underwrite after rent estimation
      const underwriteEvent: UnderwriteRequestedEvent = {
        type: "underwrite_requested",
        id: `rent-underwrite-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: { id: listingId },
      };

      await this.bus.publish(underwriteEvent);

      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "rent-estimator",
        event: "published_underwrite_requested",
        data: { listingId, reason: "rent_estimate_complete" },
      });
    }

    private async updateRentEstimate(listingId: string) {
      await new Promise((resolve) => setTimeout(resolve, 30));

      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "rent-estimator",
        event: "rent_estimate_updated",
        data: { listingId, reason: "enriched_data" },
      });

      // Request underwrite with updated rent data
      const underwriteEvent: UnderwriteRequestedEvent = {
        type: "underwrite_requested",
        id: `enriched-rent-underwrite-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: { id: listingId },
      };

      await this.bus.publish(underwriteEvent);

      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "rent-estimator",
        event: "published_underwrite_requested",
        data: { listingId, reason: "enriched_rent_data" },
      });
    }
  }

  class PipelineUnderwritingService {
    constructor(private bus: MemoryBus) {
      this.setupSubscriptions();
    }

    private async setupSubscriptions() {
      await this.bus.subscribe<UnderwriteRequestedEvent>(
        "underwrite_requested",
        async (event) => {
          eventLog.push({
            timestamp: new Date().toISOString(),
            service: "underwriting",
            event: "received_underwrite_requested",
            data: { listingId: event.data.id },
          });

          await this.processUnderwriteRequest(event.data.id);
        }
      );
    }

    private async processUnderwriteRequest(listingId: string) {
      // Simulate underwriting computation
      await new Promise((resolve) => setTimeout(resolve, 80));

      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "underwriting",
        event: "underwrite_computation_complete",
        data: { listingId },
      });

      const completedEvent: UnderwriteCompletedEvent = {
        type: "underwrite_completed",
        id: `underwrite-complete-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: {
          id: listingId,
          resultId: `result-${listingId}-${Date.now()}`,
          source: "grid",
          score: 8.5,
        },
      };

      await this.bus.publish(completedEvent);

      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "underwriting",
        event: "published_underwrite_completed",
        data: {
          listingId,
          resultId: completedEvent.data.resultId,
          score: completedEvent.data.score,
        },
      });
    }
  }

  class PipelineAlertsService {
    constructor(private bus: MemoryBus) {
      this.setupSubscriptions();
    }

    private async setupSubscriptions() {
      await this.bus.subscribe<UnderwriteCompletedEvent>(
        "underwrite_completed",
        async (event) => {
          eventLog.push({
            timestamp: new Date().toISOString(),
            service: "alerts",
            event: "received_underwrite_completed",
            data: {
              listingId: event.data.id,
              resultId: event.data.resultId,
              score: event.data.score,
            },
          });

          await this.processUnderwriteCompleted(
            event.data.id,
            event.data.resultId,
            event.data.score
          );
        }
      );
    }

    private async processUnderwriteCompleted(
      listingId: string,
      resultId: string,
      score?: number
    ) {
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Simulate checking if any alerts should be triggered
      eventLog.push({
        timestamp: new Date().toISOString(),
        service: "alerts",
        event: "alert_evaluation_complete",
        data: { listingId, resultId, score },
      });

      // Simulate triggering an alert for a good score
      if (score && score >= 8.0) {
        const alertEvent: AlertsFiredEvent = {
          type: "alert_fired",
          id: `alert-${Date.now()}`,
          timestamp: new Date().toISOString(),
          data: {
            userId: "test-user-123",
            listingId: listingId,
            resultId: resultId,
          },
        };

        await this.bus.publish(alertEvent);

        eventLog.push({
          timestamp: new Date().toISOString(),
          service: "alerts",
          event: "published_alert_fired",
          data: {
            listingId,
            resultId,
            userId: "test-user-123",
          },
        });
      }
    }
  }

  let ingestorService: PipelineIngestorService;
  let enrichmentService: PipelineEnrichmentService;
  let rentEstimatorService: PipelineRentEstimatorService;
  let underwritingService: PipelineUnderwritingService;
  let alertsService: PipelineAlertsService;

  beforeEach(async () => {
    sharedBus = new MemoryBus("pipeline-flow-test");
    eventLog = [];

    // Initialize all services
    ingestorService = new PipelineIngestorService(sharedBus);
    enrichmentService = new PipelineEnrichmentService(sharedBus);
    rentEstimatorService = new PipelineRentEstimatorService(sharedBus);
    underwritingService = new PipelineUnderwritingService(sharedBus);
    alertsService = new PipelineAlertsService(sharedBus);

    // Wait for subscriptions to be established
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (sharedBus.close) {
      await sharedBus.close();
    }
  });

  describe("Complete Pipeline Flow", () => {
    it("should process a complete pipeline flow from ingestor to alerts", async () => {
      const testListingId = "pipeline-test-listing-1";

      // Start the pipeline
      console.log("🚀 Starting pipeline flow test...");
      await ingestorService.ingestListing(testListingId, "create");

      // Wait for complete processing
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Analyze the event log
      console.log("\n📋 Complete Event Log:");
      eventLog.forEach((entry, index) => {
        console.log(
          `${index + 1}. [${entry.service.toUpperCase()}] ${
            entry.event
          }: ${JSON.stringify(entry.data)}`
        );
      });

      // Verify the pipeline flow
      const services = [
        "ingestor",
        "enrichment",
        "rent-estimator",
        "underwriting",
        "alerts",
      ];

      services.forEach((service) => {
        const serviceEvents = eventLog.filter((e) => e.service === service);
        expect(serviceEvents.length).toBeGreaterThan(
          0,
          `Service ${service} should have processed events`
        );
      });

      // Verify key events occurred
      expect(eventLog.some((e) => e.event === "publish_listing_changed")).toBe(
        true
      );
      expect(eventLog.some((e) => e.event === "received_listing_changed")).toBe(
        true
      );
      expect(eventLog.some((e) => e.event === "published_data_enriched")).toBe(
        true
      );
      expect(
        eventLog.some((e) => e.event === "published_underwrite_requested")
      ).toBe(true);
      expect(
        eventLog.some((e) => e.event === "published_underwrite_completed")
      ).toBe(true);
      expect(eventLog.some((e) => e.event === "published_alert_fired")).toBe(
        true
      );

      // Verify event ordering (events should flow in logical order)
      const ingestorPublishIndex = eventLog.findIndex(
        (e) => e.event === "publish_listing_changed"
      );
      const enrichmentReceiveIndex = eventLog.findIndex(
        (e) =>
          e.event === "received_listing_changed" && e.service === "enrichment"
      );
      const alertPublishIndex = eventLog.findIndex(
        (e) => e.event === "published_alert_fired"
      );

      expect(ingestorPublishIndex).toBeLessThan(enrichmentReceiveIndex);
      expect(enrichmentReceiveIndex).toBeLessThan(alertPublishIndex);

      console.log("✅ Pipeline flow test completed successfully!");
    });

    it("should handle multiple concurrent listings", async () => {
      const testListings = [
        "concurrent-listing-1",
        "concurrent-listing-2",
        "concurrent-listing-3",
      ];

      console.log("🚀 Starting concurrent listings test...");

      // Start all listings simultaneously
      const promises = testListings.map((listingId) =>
        ingestorService.ingestListing(listingId, "create")
      );
      await Promise.all(promises);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log(
        `\n📋 Processed ${eventLog.length} events for ${testListings.length} listings`
      );

      // Verify all listings were processed
      testListings.forEach((listingId) => {
        const listingEvents = eventLog.filter(
          (e) => e.data.listingId === listingId || e.data.id === listingId
        );

        expect(listingEvents.length).toBeGreaterThan(
          0,
          `Listing ${listingId} should have been processed`
        );

        // Should have events from multiple services
        const servicesInvolved = new Set(listingEvents.map((e) => e.service));
        expect(servicesInvolved.size).toBeGreaterThan(
          2,
          `Listing ${listingId} should have been processed by multiple services`
        );
      });

      console.log("✅ Concurrent listings test completed successfully!");
    });

    it("should handle different types of listing changes", async () => {
      const changeTypes: Array<"create" | "update" | "status_change"> = [
        "create",
        "update",
        "status_change",
      ];

      console.log("🚀 Starting different change types test...");

      // Process different change types
      for (let i = 0; i < changeTypes.length; i++) {
        const changeType = changeTypes[i];
        const listingId = `change-test-${changeType}-${i}`;

        await ingestorService.ingestListing(listingId, changeType);

        // Small delay between different change types
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Verify all change types were processed
      changeTypes.forEach((changeType) => {
        const changeEvents = eventLog.filter(
          (e) =>
            e.data.change === changeType || e.data.reason?.includes(changeType)
        );

        expect(changeEvents.length).toBeGreaterThan(
          0,
          `Change type ${changeType} should have been processed`
        );
      });

      // Verify different change types were processed
      const createEvents = eventLog.filter(
        (e) =>
          e.data.listingId?.includes("create") || e.data.id?.includes("create")
      );
      const updateEvents = eventLog.filter(
        (e) =>
          e.data.listingId?.includes("update") || e.data.id?.includes("update")
      );
      const statusChangeEvents = eventLog.filter(
        (e) =>
          e.data.listingId?.includes("status_change") ||
          e.data.id?.includes("status_change")
      );

      // All change types should have been processed
      expect(createEvents.length).toBeGreaterThan(
        0,
        "Create events should have been processed"
      );
      expect(updateEvents.length).toBeGreaterThan(
        0,
        "Update events should have been processed"
      );
      expect(statusChangeEvents.length).toBeGreaterThan(
        0,
        "Status change events should have been processed"
      );

      console.log("✅ Different change types test completed successfully!");
    });

    it("should maintain event ordering within the pipeline", async () => {
      const testListingId = "ordering-test-listing";

      await ingestorService.ingestListing(testListingId, "create");
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Extract events for this specific listing
      const listingEvents = eventLog.filter(
        (e) => e.data.listingId === testListingId || e.data.id === testListingId
      );

      // Verify key pipeline steps occurred
      const keyEvents = [
        "publish_listing_changed",
        "received_listing_changed",
        "published_data_enriched",
        "published_underwrite_completed",
        "published_alert_fired",
      ];

      // Check that all key events occurred for this listing
      keyEvents.forEach((expectedEvent) => {
        const eventExists = listingEvents.some(
          (e) => e.event === expectedEvent
        );
        expect(eventExists).toBe(
          true,
          `Key event ${expectedEvent} should have occurred for listing ${testListingId}`
        );
      });

      // Verify logical ordering: ingestor should come before alerts
      const ingestorEventIndex = listingEvents.findIndex(
        (e) => e.event === "publish_listing_changed"
      );
      const alertEventIndex = listingEvents.findIndex(
        (e) => e.event === "published_alert_fired"
      );

      expect(ingestorEventIndex).toBeGreaterThanOrEqual(0);
      expect(alertEventIndex).toBeGreaterThan(
        ingestorEventIndex,
        "Alert should be published after ingestion"
      );

      console.log("✅ Event ordering test completed successfully!");
    });

    it("should track performance metrics", async () => {
      const testListingId = "performance-test-listing";
      const startTime = Date.now();

      await ingestorService.ingestListing(testListingId, "create");
      await new Promise((resolve) => setTimeout(resolve, 600));

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Calculate processing times for each service
      const serviceMetrics = new Map<
        string,
        { count: number; avgTime: number }
      >();

      for (let i = 0; i < eventLog.length - 1; i++) {
        const currentEvent = eventLog[i];
        const nextEvent = eventLog[i + 1];

        if (currentEvent.service === nextEvent.service) {
          const duration =
            new Date(nextEvent.timestamp).getTime() -
            new Date(currentEvent.timestamp).getTime();

          const existing = serviceMetrics.get(currentEvent.service) || {
            count: 0,
            avgTime: 0,
          };
          existing.count++;
          existing.avgTime =
            (existing.avgTime * (existing.count - 1) + duration) /
            existing.count;
          serviceMetrics.set(currentEvent.service, existing);
        }
      }

      console.log("\n📊 Performance Metrics:");
      console.log(`Total pipeline duration: ${totalDuration}ms`);
      console.log(`Total events processed: ${eventLog.length}`);

      serviceMetrics.forEach((metrics, service) => {
        console.log(
          `${service}: ${metrics.count} events, avg ${metrics.avgTime.toFixed(
            1
          )}ms between events`
        );
      });

      // Performance assertions
      expect(totalDuration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(eventLog.length).toBeGreaterThan(8); // Should have significant event activity

      console.log("✅ Performance metrics test completed successfully!");
    });

    it("should handle bus status and monitoring", async () => {
      const busStatus = sharedBus.getStatus();

      expect(busStatus.subscribedTopics.length).toBeGreaterThan(0);
      expect(busStatus.handlerCount).toBeGreaterThan(0);

      console.log("📊 Bus Status:", {
        subscribedTopics: busStatus.subscribedTopics,
        handlerCount: busStatus.handlerCount,
        publishedEventCount: busStatus.publishedEventCount,
      });

      // Process a listing to generate bus activity
      await ingestorService.ingestListing("monitoring-test", "create");
      await new Promise((resolve) => setTimeout(resolve, 400));

      const updatedStatus = sharedBus.getStatus();
      expect(updatedStatus.publishedEventCount).toBeGreaterThan(
        busStatus.publishedEventCount
      );

      console.log("✅ Bus monitoring test completed successfully!");
    });
  });
});
