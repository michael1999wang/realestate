#!/usr/bin/env node

import * as http from "http";
import { Pool } from "pg";
import * as url from "url";
import { SnapshotsReadAdapter } from "../adapters/read.snapshots";
import {
  SqlAssumptionsRepo,
  SqlFactorsRepo,
  SqlUWRepo,
} from "../adapters/repo.sql";
import { dbCfg } from "../config/env";
import { Assumptions } from "../core/dto";
import { computeExact } from "../core/exact";
import { getGridRow } from "../core/grid";

const PORT = process.env.PORT || 3001;

// Global repositories
let dbPool: Pool;
let snapshotRepo: SnapshotsReadAdapter;
let assumptionsRepo: SqlAssumptionsRepo;
let uwRepo: SqlUWRepo;
let factorsRepo: SqlFactorsRepo;

/**
 * HTTP request handler
 */
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url || "", true);
  const pathname = parsedUrl.pathname;

  try {
    // Health check endpoint
    if (pathname === "/health" && req.method === "GET") {
      await handleHealthCheck(res);
      return;
    }

    // Exact underwriting computation
    if (pathname === "/underwrite" && req.method === "POST") {
      await handleUnderwrite(req, res);
      return;
    }

    // Grid lookup endpoint
    if (pathname === "/grid" && req.method === "GET") {
      await handleGridLookup(parsedUrl.query, res);
      return;
    }

    // 404 for unknown endpoints
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  } catch (error) {
    console.error("Request error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  }
}

/**
 * Health check endpoint
 */
async function handleHealthCheck(res: http.ServerResponse): Promise<void> {
  try {
    // Test database connection
    const client = await dbPool.connect();
    client.release();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "underwriting-api",
      })
    );
  } catch (error) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "unhealthy",
        error: "Database connection failed",
        timestamp: new Date().toISOString(),
      })
    );
  }
}

/**
 * Handle exact underwriting computation
 */
async function handleUnderwrite(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const body = await readRequestBody(req);

  try {
    const { listingId, assumptions } = JSON.parse(body);

    if (!listingId || !assumptions) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing listingId or assumptions" }));
      return;
    }

    // Validate assumptions structure
    if (!isValidAssumptions(assumptions)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid assumptions format" }));
      return;
    }

    console.log(`API: Computing exact underwrite for ${listingId}`);

    const result = await computeExact(
      listingId,
      assumptions,
      snapshotRepo,
      uwRepo,
      factorsRepo
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        data: {
          id: result.id,
          metrics: result.metrics,
          fromCache: result.fromCache,
        },
      })
    );
  } catch (error) {
    console.error("Underwrite error:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    } else {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Computation failed" }));
    }
  }
}

/**
 * Handle grid lookup
 */
async function handleGridLookup(
  query: any,
  res: http.ServerResponse
): Promise<void> {
  const {
    listingId,
    listingVersion,
    rentScenario,
    downPct,
    rateBps,
    amortMonths,
  } = query;

  if (
    !listingId ||
    !listingVersion ||
    !rentScenario ||
    !downPct ||
    !rateBps ||
    !amortMonths
  ) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing required query parameters" }));
    return;
  }

  try {
    const gridRow = await getGridRow(
      listingId,
      parseInt(listingVersion),
      rentScenario,
      parseFloat(downPct),
      parseInt(rateBps),
      parseInt(amortMonths),
      uwRepo
    );

    if (!gridRow) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Grid row not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        data: gridRow,
      })
    );
  } catch (error) {
    console.error("Grid lookup error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Grid lookup failed" }));
  }
}

/**
 * Read request body
 */
function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

/**
 * Validate assumptions object
 */
function isValidAssumptions(assumptions: any): assumptions is Assumptions {
  return (
    typeof assumptions === "object" &&
    typeof assumptions.downPct === "number" &&
    typeof assumptions.rateBps === "number" &&
    typeof assumptions.amortMonths === "number" &&
    ["P25", "P50", "P75"].includes(assumptions.rentScenario)
  );
}

/**
 * Initialize the API server
 */
async function main(): Promise<void> {
  console.log("🚀 Starting Underwriting API Server...");

  try {
    // Initialize database connection
    console.log("📊 Connecting to database...");
    dbPool = new Pool({
      host: dbCfg.host,
      port: dbCfg.port,
      user: dbCfg.user,
      password: dbCfg.password,
      database: dbCfg.name,
      max: 5, // Smaller pool for API
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test database connection
    const dbClient = await dbPool.connect();
    console.log("✅ Database connected successfully");
    dbClient.release();

    // Initialize repositories
    console.log("🏗️  Initializing repositories...");
    snapshotRepo = new SnapshotsReadAdapter(dbPool);
    assumptionsRepo = new SqlAssumptionsRepo(dbPool);
    uwRepo = new SqlUWRepo(dbPool);
    factorsRepo = new SqlFactorsRepo(dbPool);

    // Create HTTP server
    const server = http.createServer(handleRequest);

    // Start listening
    server.listen(PORT, () => {
      console.log(`✅ Underwriting API Server listening on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 Underwrite: POST http://localhost:${PORT}/underwrite`);
      console.log(`🔗 Grid lookup: GET http://localhost:${PORT}/grid`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("🛑 Received SIGTERM, shutting down gracefully...");
      server.close(() => {
        dbPool.end().then(() => {
          console.log("✅ Server shut down successfully");
          process.exit(0);
        });
      });
    });
  } catch (error) {
    console.error("❌ Failed to start API server:", error);
    process.exit(1);
  }
}

// Start the API server
if (require.main === module) {
  main().catch((error) => {
    console.error("💥 API server crashed:", error);
    process.exit(1);
  });
}
