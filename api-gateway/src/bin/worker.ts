#!/usr/bin/env node

/**
 * API Gateway Background Worker
 *
 * This worker handles background tasks like health monitoring,
 * cache warming, and metric collection. It uses the same BaseService
 * pattern as other microservices.
 */

import { APIGatewayService } from "../service-config";

/**
 * Main function to start the API Gateway worker
 */
async function main(): Promise<void> {
  console.log("🚀 Starting API Gateway Background Worker...");

  try {
    const service = new APIGatewayService();
    await service.start();
  } catch (error) {
    console.error("❌ Failed to start API Gateway worker:", error);
    process.exit(1);
  }
}

// Start the worker
if (require.main === module) {
  main().catch((error) => {
    console.error("💥 API Gateway worker crashed:", error);
    process.exit(1);
  });
}
