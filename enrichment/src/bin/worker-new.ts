#!/usr/bin/env node

/**
 * Enrichment Service Worker using BaseService template
 */

import { EnrichmentService } from "../service-config";

async function main() {
  const service = new EnrichmentService();
  await service.start();
}

// Start the service
if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to start enrichment service:", error);
    process.exit(1);
  });
}
