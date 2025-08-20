#!/usr/bin/env node

/**
 * Alerts Service Worker using BaseService template
 */

import { AlertsService } from "../service-config";

async function main() {
  const service = new AlertsService();
  await service.start();
}

// Start the service
if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to start alerts service:", error);
    process.exit(1);
  });
}
