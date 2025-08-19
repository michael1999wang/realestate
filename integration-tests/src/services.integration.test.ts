import { describe, expect, it } from "vitest";
import { testIngestorEnrichmentIntegration } from "./ingestor-enrichment.test";

describe("Service Integration Tests", () => {
  it("should successfully communicate between ingestor and enrichment services", async () => {
    const result = await testIngestorEnrichmentIntegration();

    expect(result.success).toBe(true);
    expect(result.metrics.eventsReceived).toBeGreaterThan(0);
    expect(result.metrics.eventsProcessed).toBeGreaterThan(0);
    expect(result.enrichedCount).toBeGreaterThan(0);
  }, 30000); // 30 second timeout for integration test
});
