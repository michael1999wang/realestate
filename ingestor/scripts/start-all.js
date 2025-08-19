#!/usr/bin/env node

const { spawn, exec } = require("child_process");
const path = require("path");

// Configuration
const ADAPTER = process.env.ADAPTER || "MOCK";
const DB_CHECK_TIMEOUT = 30000; // 30 seconds
const DB_CHECK_INTERVAL = 2000; // 2 seconds

console.log("🚀 Starting Real Estate Ingestor");
console.log(`📋 Adapter: ${ADAPTER}`);
console.log("=".repeat(50));

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDockerRunning() {
  return new Promise((resolve) => {
    exec("docker info", (error) => {
      resolve(!error);
    });
  });
}

async function checkDatabaseRunning() {
  return new Promise((resolve) => {
    exec(
      "docker compose ps db --format json",
      { cwd: process.cwd() },
      (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        try {
          const containers = stdout
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
          const dbContainer = containers.find((c) => c.Service === "db");
          resolve(dbContainer && dbContainer.State === "running");
        } catch {
          resolve(false);
        }
      }
    );
  });
}

async function waitForDatabase() {
  console.log("⏳ Waiting for database to be ready...");
  const startTime = Date.now();

  while (Date.now() - startTime < DB_CHECK_TIMEOUT) {
    try {
      await new Promise((resolve, reject) => {
        exec(
          "docker exec ingestor_db pg_isready -U ingestor -d ingestor_dev",
          (error, stdout) => {
            if (error) {
              reject(error);
            } else {
              resolve(stdout);
            }
          }
        );
      });
      console.log("✅ Database is ready!");
      return true;
    } catch (error) {
      await sleep(DB_CHECK_INTERVAL);
    }
  }

  console.log("❌ Database failed to start within timeout");
  return false;
}

async function startDatabase() {
  console.log("🐘 Starting PostgreSQL database...");

  return new Promise((resolve, reject) => {
    const dockerCompose = spawn("docker", ["compose", "up", "-d", "db"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    dockerCompose.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Database container started");
        resolve();
      } else {
        reject(new Error(`Docker compose failed with code ${code}`));
      }
    });

    dockerCompose.on("error", (error) => {
      reject(error);
    });
  });
}

async function startIngestor() {
  console.log("🏗️  Starting ingestor...");

  const ingestor = spawn("npx", ["ts-node", "src/bin/start.ts"], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env },
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("\n🛑 Shutting down...");
    ingestor.kill("SIGTERM");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  ingestor.on("close", (code) => {
    console.log(`\n📊 Ingestor exited with code ${code}`);
    process.exit(code);
  });

  ingestor.on("error", (error) => {
    console.error("❌ Failed to start ingestor:", error);
    process.exit(1);
  });
}

async function main() {
  try {
    // Check if we need a database
    if (ADAPTER === "SQL") {
      console.log("🔍 SQL adapter detected, checking database requirements...");

      // Check if Docker is running
      const dockerRunning = await checkDockerRunning();
      if (!dockerRunning) {
        console.error("❌ Docker is not running. Please start Docker Desktop.");
        console.log(
          "💡 Tip: You can use ADAPTER=MOCK for development without Docker"
        );
        process.exit(1);
      }

      // Check if database is already running
      const dbRunning = await checkDatabaseRunning();
      if (!dbRunning) {
        await startDatabase();
      } else {
        console.log("✅ Database is already running");
      }

      // Wait for database to be ready
      const dbReady = await waitForDatabase();
      if (!dbReady) {
        console.error("❌ Database failed to become ready");
        process.exit(1);
      }
    } else {
      console.log(`📝 Using ${ADAPTER} adapter (no database required)`);
    }

    // Start the ingestor
    await startIngestor();
  } catch (error) {
    console.error("❌ Startup failed:", error.message);
    process.exit(1);
  }
}

// Show usage information
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
🏠 Real Estate Ingestor - Start All Services

Usage:
  npm run start:all              Start with default settings (MOCK adapter)
  ADAPTER=SQL npm run start:all  Start with SQL adapter and database
  ADAPTER=MOCK npm run start:all Start with mock data (no database)

Environment Variables:
  ADAPTER                       Source adapter (MOCK, SQL, SELENIUM, DDF)
  POLL_INTERVAL_MS             Poll interval in milliseconds
  PAGE_SIZE                    Items per page
  BUS_ADAPTER                  Event bus adapter (LOG, SQS)
  
  For SQL adapter:
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

Examples:
  npm run start:all                                    # Mock adapter
  ADAPTER=SQL npm run start:all                        # SQL with database
  ADAPTER=MOCK POLL_INTERVAL_MS=10000 npm run start:all # Fast polling

Commands:
  npm run start:db             Start only the database
  npm run stop:db              Stop the database
  npm run dev                  Start ingestor only (no database management)
`);
  process.exit(0);
}

main();
