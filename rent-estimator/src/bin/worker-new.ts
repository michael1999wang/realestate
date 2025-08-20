#!/usr/bin/env node

/**
 * Rent Estimator Service Worker using BaseService template
 */

import { RentEstimatorService } from "../service-config";

async function main() {
  const service = new RentEstimatorService();
  await service.start();
}

// Start the service
if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to start rent estimator service:", error);
    process.exit(1);
  });
}
