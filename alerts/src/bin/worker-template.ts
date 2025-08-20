#!/usr/bin/env node

/**
 * New Alerts Service Worker using BaseService template
 *
 * This demonstrates how dramatically simplified service workers become
 * when using the BaseService template.
 *
 * Compare this to the original worker.ts - it's ~90% less code!
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
