#!/usr/bin/env node

/**
 * Underwriting Service Worker using BaseService template
 */

import { UnderwritingService } from "../service-config";

async function main() {
  const service = new UnderwritingService();
  await service.start();
}

// Start the service
if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to start underwriting service:", error);
    process.exit(1);
  });
}
