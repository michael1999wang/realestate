/**
 * Integration tests for BaseService template
 * Tests that the new service template works correctly
 */

import { MemoryBus, MemoryCache } from "@realestate/shared-utils";
import { describe, expect, it } from "vitest";

describe("BaseService Template Integration", () => {
  it("should create and use shared memory bus", async () => {
    const bus = new MemoryBus("test-service");

    let receivedEvent: unknown = null;

    // Subscribe to an event
    await bus.subscribe("test_event" as "listing_changed", async (event) => {
      receivedEvent = event;
    });

    // Publish an event
    await bus.publish({
      type: "test_event" as "listing_changed",
      id: "test-123",
      timestamp: new Date().toISOString(),
      data: { message: "hello world" },
      version: "1.0.0",
    });

    // Wait a bit for async processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(receivedEvent).toBeTruthy();
    const event = receivedEvent as { type: string; data: { message: string } };
    expect(event.type).toBe("test_event");
    expect(event.data.message).toBe("hello world");
  });

  it("should work with memory cache", async () => {
    const cache = new MemoryCache();

    await cache.set("test_key", "test_value", 60);
    const value = await cache.get("test_key");

    expect(value).toBe("test_value");

    const nonExistent = await cache.get("non_existent");
    expect(nonExistent).toBeNull();
  });

  it("should demonstrate service communication pattern", async () => {
    const bus = new MemoryBus("integration-test");
    const cache = new MemoryCache();

    // Simulate ingestor publishing listing_changed
    const listingId = "test-listing-123";

    let enrichmentProcessed = false;
    let underwriteRequested = false;

    // Enrichment service simulation
    await bus.subscribe("listing_changed", async (event) => {
      enrichmentProcessed = true;

      // Simulate enrichment work
      const eventData = event as unknown as { data: { id: string } };
      await cache.set(`enriched:${eventData.data.id}`, { enriched: true }, 60);

      // Publish underwrite request
      await bus.publish({
        type: "underwrite_requested",
        id: "req-" + Date.now(),
        timestamp: new Date().toISOString(),
        data: { id: eventData.data.id },
        version: "1.0.0",
      });
    });

    // Underwriting service simulation
    await bus.subscribe("underwrite_requested", async (event) => {
      underwriteRequested = true;

      // Simulate underwriting work
      const eventData = event as unknown as { data: { id: string } };
      const enriched = await cache.get(`enriched:${eventData.data.id}`);
      expect(enriched).toBeTruthy();
    });

    // Ingestor publishes listing_changed
    await bus.publish({
      type: "listing_changed",
      id: "change-" + Date.now(),
      timestamp: new Date().toISOString(),
      data: {
        id: listingId,
        updatedAt: new Date().toISOString(),
        change: "create",
      },
      version: "1.0.0",
    });

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(enrichmentProcessed).toBe(true);
    expect(underwriteRequested).toBe(true);
  });
});
