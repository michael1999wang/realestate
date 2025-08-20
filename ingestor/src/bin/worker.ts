#!/usr/bin/env node

/**
 * Ingestor Service Worker using BaseService template
 */

import { IngestorService } from "../service-config";

async function main() {
  const service = new IngestorService();
  await service.start();
}

// Start the service
if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to start ingestor service:", error);
    process.exit(1);
  });
}
