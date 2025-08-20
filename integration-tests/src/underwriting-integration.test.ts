/**
 * Integration tests for the Underwriting Service
 * Tests the full pipeline from listing changes to underwriting completion
 */

import { ChildProcess, spawn } from "child_process";
import Redis from "ioredis";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Test configuration
const TEST_CONFIG = {
  db: {
    host: "localhost",
    port: 5436,
    user: "uw",
    password: "uw",
    database: "uw_dev",
  },
  redis: {
    url: "redis://localhost:6379",
  },
  services: {
    underwriting: {
      workerPort: 3010,
      apiPort: 3011,
    },
  },
};

describe.skip("Underwriting Service Integration", () => {
  let dbPool: Pool;
  let redisClient: Redis;
  let workerProcess: ChildProcess | null = null;
  let apiProcess: ChildProcess | null = null;

  beforeAll(async () => {
    // Initialize database connection
    dbPool = new Pool(TEST_CONFIG.db);

    // Initialize Redis connection
    redisClient = new Redis(TEST_CONFIG.redis.url);

    // Ensure database schema is set up
    await setupTestDatabase();

    // Start underwriting services
    await startUnderwritingServices();

    // Wait for services to be ready
    await waitForServicesReady();
  }, 30000);

  afterAll(async () => {
    // Stop services
    if (workerProcess) {
      workerProcess.kill("SIGTERM");
    }
    if (apiProcess) {
      apiProcess.kill("SIGTERM");
    }

    // Close connections
    await dbPool.end();
    await redisClient.quit();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestData();
  });

  describe("Event-Driven Processing", () => {
    it("should process underwrite_requested event with default assumptions", async () => {
      // Setup test listing data
      const listingId = "test-listing-001";
      await insertTestListing(listingId);

      // Publish underwrite_requested event
      const requestEvent = {
        type: "underwrite_requested",
        id: listingId,
      };

      await redisClient.publish(
        "underwrite_requested",
        JSON.stringify(requestEvent)
      );

      // Wait for processing and check results
      const completionEvent = await waitForCompletionEvent(listingId, 10000);

      expect(completionEvent).toBeDefined();
      expect(completionEvent.type).toBe("underwrite_completed");
      expect(completionEvent.id).toBe(listingId);
      expect(completionEvent.source).toBe("grid");

      // Verify grid was computed
      const gridCount = await countGridRows(listingId);
      expect(gridCount).toBeGreaterThan(1000); // Should have many grid combinations
    });

    it("should process underwrite_requested event with custom assumptions", async () => {
      const listingId = "test-listing-002";
      await insertTestListing(listingId);

      // Insert custom assumptions
      const assumptionsId = await insertTestAssumptions();

      // Publish underwrite_requested event with assumptions
      const requestEvent = {
        type: "underwrite_requested",
        id: listingId,
        assumptionsId,
      };

      await redisClient.publish(
        "underwrite_requested",
        JSON.stringify(requestEvent)
      );

      // Wait for processing
      const completionEvent = await waitForCompletionEvent(listingId, 10000);

      expect(completionEvent).toBeDefined();
      expect(completionEvent.source).toBe("exact");

      // Verify exact computation was cached
      const exactCount = await countExactRows(listingId);
      expect(exactCount).toBe(1);
    });

    it("should recompute on listing_changed event", async () => {
      const listingId = "test-listing-003";
      await insertTestListing(listingId);

      // Initial computation
      await redisClient.publish(
        "underwrite_requested",
        JSON.stringify({
          type: "underwrite_requested",
          id: listingId,
        })
      );

      await waitForCompletionEvent(listingId, 5000);
      const initialGridCount = await countGridRows(listingId);

      // Update listing (simulate price change)
      await updateTestListing(listingId, { price: 1100000, listingVersion: 2 });

      // Publish listing_changed event
      const changeEvent = {
        type: "listing_changed",
        id: listingId,
        updatedAt: new Date().toISOString(),
        change: "update",
        source: "MOCK",
        dirty: ["price"],
      };

      await redisClient.publish("listing_changed", JSON.stringify(changeEvent));

      // Wait for recomputation
      await waitForCompletionEvent(listingId, 5000);

      // Should have grid for new version
      const newGridCount = await countGridRows(listingId, 2);
      expect(newGridCount).toBeGreaterThan(0);
      expect(newGridCount).toBeGreaterThanOrEqual(initialGridCount);
    });
  });

  describe("HTTP API Integration", () => {
    it("should compute exact metrics via API", async () => {
      const listingId = "test-listing-004";
      await insertTestListing(listingId);

      const requestBody = {
        listingId,
        assumptions: {
          downPct: 0.25,
          rateBps: 475,
          amortMonths: 300,
          rentScenario: "P75",
        },
      };

      const response = await fetch(
        `http://localhost:${TEST_CONFIG.services.underwriting.apiPort}/underwrite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      expect(response.ok).toBe(true);

      const result: any = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.metrics).toBeDefined();
      expect(result.data.metrics.price).toBe(1000000);
      expect(result.data.metrics.noi).toBe(55000); // P75 scenario
      expect(result.data.fromCache).toBe(false); // First computation
    });

    it("should return cached result on second API call", async () => {
      const listingId = "test-listing-005";
      await insertTestListing(listingId);

      const requestBody = {
        listingId,
        assumptions: {
          downPct: 0.2,
          rateBps: 500,
          amortMonths: 360,
          rentScenario: "P50",
        },
      };

      // First call
      const response1 = await fetch(
        `http://localhost:${TEST_CONFIG.services.underwriting.apiPort}/underwrite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      const result1 = (await response1.json()) as {
        data: { fromCache: boolean; id: string };
      };
      expect(result1.data.fromCache).toBe(false);

      // Second call (should hit cache)
      const response2 = await fetch(
        `http://localhost:${TEST_CONFIG.services.underwriting.apiPort}/underwrite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      const result2 = (await response2.json()) as {
        data: { fromCache: boolean; id: string };
      };
      expect(result2.data.fromCache).toBe(true);
      expect(result2.data.id).toBe(result1.data.id);
    });

    it("should lookup grid data via API", async () => {
      const listingId = "test-listing-006";
      await insertTestListing(listingId);

      // First compute grid
      await redisClient.publish(
        "underwrite_requested",
        JSON.stringify({
          type: "underwrite_requested",
          id: listingId,
        })
      );

      await waitForCompletionEvent(listingId, 10000);

      // Lookup specific grid row
      const queryParams = new URLSearchParams({
        listingId,
        listingVersion: "1",
        rentScenario: "P50",
        downPct: "0.20",
        rateBps: "500",
        amortMonths: "360",
      });

      const response = await fetch(
        `http://localhost:${TEST_CONFIG.services.underwriting.apiPort}/grid?${queryParams}`
      );
      expect(response.ok).toBe(true);

      const result: any = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.listingId).toBe(listingId);
      expect(result.data.rentScenario).toBe("P50");
      expect(result.data.downPctBin).toBe(0.2);
    });

    it("should return health check", async () => {
      const response = await fetch(
        `http://localhost:${TEST_CONFIG.services.underwriting.apiPort}/health`
      );
      expect(response.ok).toBe(true);

      const result: any = await response.json();
      expect(result.status).toBe("healthy");
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle multiple concurrent requests", async () => {
      const listingIds = [
        "perf-001",
        "perf-002",
        "perf-003",
        "perf-004",
        "perf-005",
      ];

      // Setup test listings
      await Promise.all(listingIds.map((id) => insertTestListing(id)));

      // Send concurrent requests
      const promises = listingIds.map((id) =>
        redisClient.publish(
          "underwrite_requested",
          JSON.stringify({
            type: "underwrite_requested",
            id,
          })
        )
      );

      await Promise.all(promises);

      // Wait for all completions
      const completionPromises = listingIds.map((id) =>
        waitForCompletionEvent(id, 15000)
      );
      const completions = await Promise.all(completionPromises);

      // Verify all completed successfully
      completions.forEach((completion, index) => {
        expect(completion).toBeDefined();
        expect(completion.id).toBe(listingIds[index]);
      });
    });

    it("should maintain cache consistency under load", async () => {
      const listingId = "cache-test-001";
      await insertTestListing(listingId);

      const assumptions = {
        downPct: 0.3,
        rateBps: 550,
        amortMonths: 300,
        rentScenario: "P75",
      };

      // Send multiple identical requests simultaneously
      const requests = Array(5)
        .fill(null)
        .map(() =>
          fetch(
            `http://localhost:${TEST_CONFIG.services.underwriting.apiPort}/underwrite`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ listingId, assumptions }),
            }
          )
        );

      const responses = await Promise.all(requests);
      const results = (await Promise.all(
        responses.map((r) => r.json())
      )) as Array<{ success: boolean; data: { id: string } }>;

      // All should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Should only have one exact cache entry
      const exactCount = await countExactRows(listingId);
      expect(exactCount).toBe(1);

      // All results should have same ID (from cache)
      const ids = results.map((r) => r.data.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1);
    });
  });

  // Helper functions

  async function setupTestDatabase(): Promise<void> {
    // Run the init.sql script
    const initSql = await import("fs").then((fs) =>
      fs.promises.readFile("../underwriting/sql/init.sql", "utf8")
    );
    await dbPool.query(initSql);
  }

  async function startUnderwritingServices(): Promise<void> {
    // Start worker
    workerProcess = spawn("npm", ["run", "dev:worker"], {
      cwd: "../underwriting",
      env: {
        ...process.env,
        PORT: TEST_CONFIG.services.underwriting.workerPort.toString(),
      },
      stdio: "pipe",
    });

    // Start API
    apiProcess = spawn("npm", ["run", "dev:api"], {
      cwd: "../underwriting",
      env: {
        ...process.env,
        PORT: TEST_CONFIG.services.underwriting.apiPort.toString(),
      },
      stdio: "pipe",
    });
  }

  async function waitForServicesReady(): Promise<void> {
    // Wait for API to be ready
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(
          `http://localhost:${TEST_CONFIG.services.underwriting.apiPort}/health`
        );
        if (response.ok) break;
      } catch (error) {
        // Service not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async function cleanupTestData(): Promise<void> {
    await dbPool.query("DELETE FROM underwrite_grid WHERE listing_id LIKE $1", [
      "test-%",
    ]);
    await dbPool.query(
      "DELETE FROM underwrite_exact WHERE listing_id LIKE $1",
      ["test-%"]
    );
    await dbPool.query("DELETE FROM listing_base WHERE listing_id LIKE $1", [
      "test-%",
    ]);
    await dbPool.query("DELETE FROM user_assumptions WHERE name LIKE $1", [
      "test-%",
    ]);
  }

  async function insertTestListing(listingId: string): Promise<void> {
    await dbPool.query(
      `
      INSERT INTO listing_base (
        listing_id, listing_version, price, closing_costs,
        noi_p25, noi_p50, noi_p75, city, province, property_type
      ) VALUES ($1, 1, 1000000, 25000, 45000, 50000, 55000, 'Toronto', 'ON', 'Condo')
      ON CONFLICT (listing_id) DO UPDATE SET
        listing_version = EXCLUDED.listing_version,
        price = EXCLUDED.price,
        updated_at = now()
    `,
      [listingId]
    );
  }

  async function updateTestListing(
    listingId: string,
    updates: any
  ): Promise<void> {
    const { price, listingVersion } = updates;
    await dbPool.query(
      `
      UPDATE listing_base 
      SET price = $2, listing_version = $3, updated_at = now()
      WHERE listing_id = $1
    `,
      [listingId, price, listingVersion]
    );
  }

  async function insertTestAssumptions(): Promise<string> {
    const result = await dbPool.query(`
      INSERT INTO user_assumptions (
        name, down_pct, rate_bps, amort_months, rent_scenario
      ) VALUES ('test-assumptions', 0.25, 475, 300, 'P75')
      RETURNING id
    `);
    return result.rows[0].id;
  }

  async function waitForCompletionEvent(
    listingId: string,
    timeoutMs: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const subscriber = new Redis(TEST_CONFIG.redis.url);
      const timeout = setTimeout(() => {
        subscriber.quit();
        reject(
          new Error(`Timeout waiting for completion event for ${listingId}`)
        );
      }, timeoutMs);

      subscriber.subscribe("underwrite_completed");
      subscriber.on("message", (channel, message) => {
        if (channel === "underwrite_completed") {
          const event = JSON.parse(message);
          if (event.id === listingId) {
            clearTimeout(timeout);
            subscriber.quit();
            resolve(event);
          }
        }
      });
    });
  }

  async function countGridRows(
    listingId: string,
    version: number = 1
  ): Promise<number> {
    const result = await dbPool.query(
      "SELECT COUNT(*) FROM underwrite_grid WHERE listing_id = $1 AND listing_version = $2",
      [listingId, version]
    );
    return parseInt(result.rows[0].count);
  }

  async function countExactRows(listingId: string): Promise<number> {
    const result = await dbPool.query(
      "SELECT COUNT(*) FROM underwrite_exact WHERE listing_id = $1",
      [listingId]
    );
    return parseInt(result.rows[0].count);
  }
});
