/**
 * Integration tests for BaseService template
 * Tests that the new service template works correctly
 */

import { MemoryBus, MemoryCache } from "@realestate/shared-utils";
import { describe, expect, it } from "vitest";

describe("BaseService Template Integration", () => {
  it("should create and use shared memory bus", async () => {
    const bus = new MemoryBus("test-service");

    let receivedEvent: any = null;

    // Subscribe to an event
    await bus.subscribe("test_event", async (event) => {
      receivedEvent = event;
    });

    // Publish an event
    await bus.publish({
      type: "test_event",
      id: "test-123",
      timestamp: new Date().toISOString(),
      data: { message: "hello world" },
      version: "1.0.0",
    });

    // Wait a bit for async processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(receivedEvent).toBeTruthy();
    expect(receivedEvent.type).toBe("test_event");
    expect(receivedEvent.data.message).toBe("hello world");
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
    await bus.subscribe("listing_changed", async (event: any) => {
      enrichmentProcessed = true;

      // Simulate enrichment work
      await cache.set(`enriched:${event.data.id}`, { enriched: true }, 60);

      // Publish underwrite request
      await bus.publish({
        type: "underwrite_requested",
        id: "req-" + Date.now(),
        timestamp: new Date().toISOString(),
        data: { id: event.data.id },
        version: "1.0.0",
      });
    });

    // Underwriting service simulation
    await bus.subscribe("underwrite_requested", async (event: any) => {
      underwriteRequested = true;

      // Simulate underwriting work
      const enriched = await cache.get(`enriched:${event.data.id}`);
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
