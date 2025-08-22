#!/usr/bin/env ts-node

/**
 * Demo Setup Script
 *
 * This script sets up the entire pipeline with demo data:
 * 1. Starts all databases with Docker
 * 2. Runs database migrations for each service
 * 3. Seeds the ingestor with mock data from fixtures
 * 4. Triggers the pipeline to process data through all services
 * 5. Verifies data flow through the system
 */

import { ChildProcess, execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";

interface ServiceConfig {
  name: string;
  directory: string;
  databaseName: string;
  port: number;
  user: string;
  password: string;
}

const services: ServiceConfig[] = [
  {
    name: "ingestor",
    directory: "ingestor",
    databaseName: "ingestor_dev",
    port: 5433,
    user: "ingestor",
    password: "ingestor",
  },
  {
    name: "enrichment",
    directory: "enrichment",
    databaseName: "enrichment_dev",
    port: 5434,
    user: "enrichment",
    password: "enrichment",
  },
  {
    name: "rent-estimator",
    directory: "rent-estimator",
    databaseName: "rent_dev",
    port: 5435,
    user: "rent",
    password: "rent",
  },
  {
    name: "underwriting",
    directory: "underwriting",
    databaseName: "uw_dev",
    port: 5436,
    user: "uw",
    password: "uw",
  },
  {
    name: "alerts",
    directory: "alerts",
    databaseName: "alerts_dev",
    port: 5437,
    user: "alerts",
    password: "alerts",
  },
];

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command: string, cwd?: string): Promise<void> {
  console.log(`🔧 Running: ${command} ${cwd ? `(in ${cwd})` : ""}`);
  try {
    execSync(command, {
      cwd: cwd || process.cwd(),
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    throw error;
  }
}

async function createDatabase(service: ServiceConfig): Promise<void> {
  // Skip database creation - databases are already created by Docker init scripts
  console.log(
    `✅ Database ${service.databaseName} exists (created by Docker init)`
  );
}

async function runSqlFile(
  service: ServiceConfig,
  sqlFile: string
): Promise<void> {
  if (!fs.existsSync(sqlFile)) {
    console.log(`⚠️ SQL file not found: ${sqlFile}, skipping`);
    return;
  }

  console.log(`📜 Running SQL file: ${sqlFile} on ${service.databaseName}`);

  const pool = new Pool({
    host: dbConfig.host,
    port: service.port,
    user: service.user,
    password: service.password,
    database: service.databaseName,
  });

  try {
    // Wait for database to be ready
    let retries = 10;
    while (retries > 0) {
      try {
        await pool.query("SELECT 1");
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(
          `⏳ Waiting for ${service.databaseName} to be ready... (${retries} retries left)`
        );
        await sleep(2000);
      }
    }

    const sqlContent = fs.readFileSync(sqlFile, "utf-8");
    await pool.query(sqlContent);
    console.log(`✅ SQL executed successfully on ${service.databaseName}`);
  } catch (error) {
    console.error(`❌ Error running SQL on ${service.databaseName}:`, error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function seedIngestor(): Promise<void> {
  console.log("🌱 Seeding ingestor with mock data...");

  const ingestorService = services.find((s) => s.name === "ingestor")!;
  const pool = new Pool({
    host: dbConfig.host,
    port: ingestorService.port,
    user: ingestorService.user,
    password: ingestorService.password,
    database: ingestorService.databaseName,
  });

  try {
    // Load mock data from fixtures
    const fixturesPath = path.join(
      __dirname,
      "../ingestor/fixtures/treb_listings.json"
    );
    const mockListings = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));

    // Clear existing data
    await pool.query("DELETE FROM listings");
    await pool.query("UPDATE sync_state SET watermark = $1 WHERE source = $2", [
      "2024-01-01T00:00:00Z",
      "MOCK",
    ]);

    // Insert mock listings
    for (const listing of mockListings) {
      const id = `listing-${listing.MlsNumber}`;

      await pool.query(
        `
        INSERT INTO listings (
          id, mls_number, source_board, status, listed_at, updated_at,
          address, property_type, beds, baths, sqft, year_built,
          list_price, taxes_annual, condo_fee_monthly, media, brokerage, raw
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        ) ON CONFLICT (id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          status = EXCLUDED.status,
          list_price = EXCLUDED.list_price
      `,
        [
          id,
          listing.MlsNumber,
          "TREB",
          listing.Status,
          listing.ListDate,
          listing.Updated,
          JSON.stringify({
            streetNumber: listing.Address.StreetNumber,
            streetName: listing.Address.StreetName,
            city: listing.Address.City,
            postalCode: listing.Address.PostalCode,
            province: "ON",
            country: "Canada",
          }),
          listing.PropertyType,
          listing.BedroomsTotal,
          listing.BathroomsTotalInteger,
          listing.LivingArea,
          listing.YearBuilt,
          listing.ListPrice,
          listing.TaxAnnualAmount,
          listing.AssociationFee || listing.MaintenanceFee,
          JSON.stringify(listing.Media || []),
          JSON.stringify(listing.ListOffice || {}),
          JSON.stringify(listing),
        ]
      );
    }

    console.log(`✅ Seeded ${mockListings.length} listings into ingestor`);
  } catch (error) {
    console.error("❌ Error seeding ingestor:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function startServices(): Promise<ChildProcess[]> {
  console.log("🚀 Starting all services...");

  const processes: ChildProcess[] = [];

  // Start services in background
  for (const service of services.slice(0, -1)) {
    // Don't start API gateway yet
    console.log(`🔄 Starting ${service.name}...`);

    // Set database environment variables for this service
    const serviceEnv = {
      ...process.env,
      DB_HOST: dbConfig.host,
      DB_PORT: service.port.toString(),
      DB_USER: service.user,
      DB_PASSWORD: service.password,
      DB_NAME: service.databaseName,
    };

    const serviceProcess = spawn("npm", ["run", "dev"], {
      cwd: service.directory,
      stdio: "pipe", // Capture output to avoid clutter
      env: serviceEnv,
    });

    if (serviceProcess.stdout) {
      serviceProcess.stdout.on("data", (data: Buffer) => {
        console.log(`[${service.name}] ${data.toString().trim()}`);
      });
    }

    if (serviceProcess.stderr) {
      serviceProcess.stderr.on("data", (data: Buffer) => {
        console.error(`[${service.name}] ${data.toString().trim()}`);
      });
    }

    processes.push(serviceProcess);

    // Wait a bit between service starts
    await sleep(2000);
  }

  console.log("⏳ Waiting for services to initialize...");
  await sleep(10000); // Give services time to start

  return processes;
}

async function triggerPipeline(): Promise<void> {
  console.log("⚡ Triggering data pipeline...");

  // Connect to Redis and publish events to trigger the pipeline
  // This will cause:
  // 1. Ingestor to publish listings.changed events
  // 2. Enrichment to process listings
  // 3. Rent-estimator to process listings
  // 4. Underwriting to process enriched data
  // 5. Alerts to process underwriting results

  const ingestorService = services.find((s) => s.name === "ingestor")!;
  const pool = new Pool({
    host: dbConfig.host,
    port: ingestorService.port,
    user: ingestorService.user,
    password: ingestorService.password,
    database: ingestorService.databaseName,
  });

  try {
    // Get all listings and update their updated_at to trigger events
    const result = await pool.query("SELECT id FROM listings LIMIT 5");

    for (const row of result.rows) {
      await pool.query(
        "UPDATE listings SET updated_row_at = NOW() WHERE id = $1",
        [row.id]
      );
      console.log(`📤 Triggered pipeline for listing: ${row.id}`);
      await sleep(1000); // Stagger events
    }
  } catch (error) {
    console.error("❌ Error triggering pipeline:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function verifyData(): Promise<void> {
  console.log("🔍 Verifying data flow through pipeline...");

  // Check that data exists in each service's database
  for (const service of services) {
    try {
      const pool = new Pool({
        host: dbConfig.host,
        port: service.port,
        user: service.user,
        password: service.password,
        database: service.databaseName,
      });

      let count = 0;

      switch (service.name) {
        case "ingestor":
          const listings = await pool.query("SELECT COUNT(*) FROM listings");
          count = listings.rows[0].count;
          break;
        case "enrichment":
          const enrichments = await pool.query(
            "SELECT COUNT(*) FROM enrichments"
          );
          count = enrichments.rows[0].count;
          break;
        case "underwriting":
          const results = await pool.query(
            "SELECT COUNT(*) FROM underwrite_grid"
          );
          count = results.rows[0].count;
          break;
        case "alerts":
          // Check if tables exist first
          const tables = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name IN ('saved_searches', 'alerts')
          `);
          if (tables.rows.length > 0) {
            const alerts = await pool.query(
              "SELECT COUNT(*) FROM saved_searches"
            );
            count = alerts.rows[0].count;
          }
          break;
        case "api-gateway":
          const users = await pool.query("SELECT COUNT(*) FROM users");
          count = users.rows[0].count;
          break;
      }

      console.log(`✅ ${service.name}: ${count} records`);
      await pool.end();
    } catch (error) {
      console.log(
        `⚠️ ${service.name}: Could not verify data (${
          (error as Error).message
        })`
      );
    }
  }
}

async function main(): Promise<void> {
  console.log("🎬 Starting Real Estate Demo Setup...\n");

  try {
    // 1. Start Docker services (databases and Redis)
    console.log("🐳 Starting Docker services...");
    await runCommand("npm run docker:up");
    await sleep(5000); // Wait for databases to be ready

    // 2. Create databases for each service (already done by Docker)
    console.log("\n📁 Verifying databases exist...");
    for (const service of services) {
      await createDatabase(service);
    }

    // 3. Skip database migrations (already done by Docker init scripts)
    console.log("\n🗂️ Database schemas already initialized by Docker");

    // 4. Seed the ingestor with mock data
    console.log("\n🌱 Seeding data...");
    await seedIngestor();

    // 5. Start all services
    console.log("\n🚀 Starting microservices...");
    const processes = await startServices();

    // 6. Trigger the data pipeline
    console.log("\n⚡ Triggering data pipeline...");
    await triggerPipeline();

    // 7. Wait for processing
    console.log("\n⏳ Waiting for pipeline processing...");
    await sleep(15000);

    // 8. Verify data
    console.log("\n🔍 Verifying data flow...");
    await verifyData();

    // 9. Start API Gateway
    console.log("\n🌐 Starting API Gateway...");
    const apiGatewayEnv = {
      ...process.env,
      // API Gateway has its own database (could be on a separate port)
      DB_HOST: dbConfig.host,
      DB_PORT: "5432", // API Gateway can use default port or its own
      DB_USER: "postgres",
      DB_PASSWORD: "password",
      DB_NAME: "api_gateway",
      // Service database connection info for read adapters
      INGESTOR_DB_HOST: dbConfig.host,
      INGESTOR_DB_PORT: "5433",
      INGESTOR_DB_USER: "ingestor",
      INGESTOR_DB_PASSWORD: "ingestor",
      INGESTOR_DB_NAME: "ingestor_dev",
      ENRICHMENT_DB_HOST: dbConfig.host,
      ENRICHMENT_DB_PORT: "5434",
      ENRICHMENT_DB_USER: "enrichment",
      ENRICHMENT_DB_PASSWORD: "enrichment",
      ENRICHMENT_DB_NAME: "enrichment_dev",
      UNDERWRITING_DB_HOST: dbConfig.host,
      UNDERWRITING_DB_PORT: "5436",
      UNDERWRITING_DB_USER: "uw",
      UNDERWRITING_DB_PASSWORD: "uw",
      UNDERWRITING_DB_NAME: "uw_dev",
    };

    const apiGatewayProcess = spawn("npm", ["run", "dev:api"], {
      cwd: "api-gateway",
      stdio: "inherit",
      env: apiGatewayEnv,
    });

    processes.push(apiGatewayProcess);

    console.log("\n🎉 Demo setup complete!");
    console.log("\n📋 Next steps:");
    console.log("  1. API Gateway: http://localhost:8080");
    console.log("  2. Demo Web App: npm run dev:demo (in a new terminal)");
    console.log("  3. Demo Web App URL: http://localhost:3000");
    console.log("\n⚠️ Press Ctrl+C to stop all services");

    // Keep the script running and handle cleanup
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down services...");
      processes.forEach((proc) => proc.kill());
      process.exit(0);
    });

    // Wait for services to exit
    await Promise.all(
      processes.map(
        (proc) =>
          new Promise((resolve) => {
            proc.on("exit", resolve);
          })
      )
    );
  } catch (error) {
    console.error("\n💥 Setup failed:", error);
    process.exit(1);
  }
}

// Run the setup
if (require.main === module) {
  main().catch((error) => {
    console.error("💥 Demo setup crashed:", error);
    process.exit(1);
  });
}

export { main as runDemoSetup };
