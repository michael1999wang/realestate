/**
 * Service Generator CLI
 *
 * Generates new services using the BaseService template
 * Usage: npx ts-node generator.ts my-service --subscribes=event1,event2 --publishes=event3
 */

import * as fs from "fs";
import * as path from "path";

interface GeneratorOptions {
  name: string;
  subscribes?: string[];
  publishes?: string[];
  database?: boolean;
  cache?: "redis" | "memory";
  external?: string[];
}

/**
 * Generate service configuration template
 */
function generateServiceConfig(options: GeneratorOptions): string {
  const {
    name,
    subscribes = [],
    publishes = [],
    database = true,
    cache = "redis",
    external = [],
  } = options;

  const className =
    name.charAt(0).toUpperCase() + name.slice(1) + "BusinessLogic";
  const serviceName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const eventMap = subscribes.reduce((acc, event) => {
    const eventType = event.replace(/_/g, "").replace(/\./g, "");
    acc[
      event
    ] = `{\n    // Define ${event} payload structure here\n    id: string;\n    data?: any;\n  }`;
    return acc;
  }, {} as Record<string, string>);

  const handlers = subscribes
    .map((event) => {
      const handlerName =
        "handle" +
        event
          .split(/[_.]/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("");

      return `  /**
   * Handle ${event} events
   */
  async ${handlerName}(event: ${
        serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
      }EventMap['${event}']): Promise<void> {
    this.deps.logger.info(\`Processing ${event} for \${event.id}\`);
    
    // TODO: Implement your business logic here
    
    // Example: publish follow-up event if needed
    // await this.deps.bus.publish('${publishes[0] || "some_event"}', {
    //   id: event.id,
    //   result: 'processed'
    // });
  }`;
    })
    .join("\n\n");

  const subscriptions = subscribes
    .map(
      (event) => `    {
      topic: '${event}',
      handler: 'handle${event
        .split(/[_.]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("")}',
      consumerGroup: '${serviceName}',
      options: {
        retries: 3,
        debounce: 1000,
      }
    }`
    )
    .join(",\n");

  const publicationsList = publishes
    .map((event) => `    { topic: '${event}' }`)
    .join(",\n");

  return `/**
 * ${name.charAt(0).toUpperCase() + name.slice(1)} Service Configuration
 */

import { BaseService, ServiceConfig } from "@realestate/shared-utils";
import { Pool } from "pg";

/**
 * Event map for type safety
 */
export interface ${
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  }EventMap {
${Object.entries(eventMap)
  .map(([event, payload]) => `  ${event}: ${payload};`)
  .join("\n")}
}

/**
 * Service dependencies
 */
export interface ${
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  }Dependencies {
  bus: any;
  cache?: any;
  db?: Pool;
  repositories: {
    // TODO: Define your repository interfaces
    [key: string]: any;
  };
  clients: {
    // TODO: Define your external client interfaces  
    [key: string]: any;
  };
  logger: any;
}

/**
 * Business logic implementation
 */
export class ${className} {
  constructor(private deps: ${
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  }Dependencies) {}

${handlers}
}

/**
 * Service configuration
 */
export const ${serviceName}ServiceConfig: ServiceConfig<${
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  }Dependencies, ${
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  }EventMap> = {
  name: '${serviceName}',
  version: '1.0.0',
  
  ${
    database
      ? `database: {
    schema: 'sql/init.sql',
    pool: {
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  },`
      : "// database: undefined,"
  }
  
  cache: {
    type: '${cache}',
  },
  
  subscriptions: [
${subscriptions}
  ],
  
  ${
    publishes.length > 0
      ? `publications: [
${publicationsList}
  ],`
      : "// publications: [],"
  }
  
  createBusinessLogic: (deps) => new ${className}(deps),
  
  createRepositories: (pool) => ({
    // TODO: Initialize your repositories
    // example: new ExampleRepository(pool),
  }),
  
  createExternalClients: () => ({
    // TODO: Initialize your external clients
    // example: new ExampleAPIClient(),
  }),
  
  healthCheck: {
    intervalMs: 30000,
    customChecks: [
      {
        name: 'service_health',
        check: async () => {
          // TODO: Implement health check logic
          return true;
        }
      }
    ]
  },
  
  shutdownTimeoutMs: 15000,
};

/**
 * ${name.charAt(0).toUpperCase() + name.slice(1)} Service
 */
export class ${
    name.charAt(0).toUpperCase() + name.slice(1)
  }Service extends BaseService<${
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  }Dependencies, ${
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  }EventMap> {
  constructor() {
    super(${serviceName}ServiceConfig);
  }
}`;
}

/**
 * Generate worker entry point
 */
function generateWorker(serviceName: string): string {
  const className =
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1) + "Service";

  return `#!/usr/bin/env node

/**
 * ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} Service Worker
 */

import { ${className} } from '../service-config';

async function main() {
  const service = new ${className}();
  await service.start();
}

// Start the service
if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start ${serviceName} service:', error);
    process.exit(1);
  });
}`;
}

/**
 * Generate package.json
 */
function generatePackageJson(serviceName: string): string {
  return `{
  "name": "@realestate/${serviceName}",
  "version": "1.0.0",
  "description": "${
    serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  } service",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/bin/worker.ts",
    "start": "node dist/bin/worker.js",
    "test": "vitest",
    "test:watch": "vitest --watch"
  },
  "dependencies": {
    "@realestate/shared-utils": "workspace:*",
    "pg": "^8.11.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/pg": "^8.10.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}`;
}

/**
 * Generate service structure
 */
export function generateService(options: GeneratorOptions): void {
  const { name } = options;
  const serviceName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const serviceDir = path.join(process.cwd(), serviceName);

  // Create directory structure
  fs.mkdirSync(serviceDir, { recursive: true });
  fs.mkdirSync(path.join(serviceDir, "src", "bin"), { recursive: true });
  fs.mkdirSync(path.join(serviceDir, "src", "adapters"), { recursive: true });
  fs.mkdirSync(path.join(serviceDir, "src", "core"), { recursive: true });
  fs.mkdirSync(path.join(serviceDir, "src", "config"), { recursive: true });
  fs.mkdirSync(path.join(serviceDir, "sql"), { recursive: true });
  fs.mkdirSync(path.join(serviceDir, "tests"), { recursive: true });

  // Generate files
  fs.writeFileSync(
    path.join(serviceDir, "src", "service-config.ts"),
    generateServiceConfig(options)
  );

  fs.writeFileSync(
    path.join(serviceDir, "src", "bin", "worker.ts"),
    generateWorker(serviceName)
  );

  fs.writeFileSync(
    path.join(serviceDir, "package.json"),
    generatePackageJson(serviceName)
  );

  // Generate TypeScript config
  fs.writeFileSync(
    path.join(serviceDir, "tsconfig.json"),
    `{
  "extends": "../shared-utils/tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}`
  );

  // Generate README
  fs.writeFileSync(
    path.join(serviceDir, "README.md"),
    `# ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} Service

## Overview

${
  serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
} service built using the BaseService template.

## Events

### Subscriptions
${options.subscribes?.map((event) => `- \`${event}\``).join("\n") || "None"}

### Publications  
${options.publishes?.map((event) => `- \`${event}\``).join("\n") || "None"}

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
\`\`\`

## Configuration

Set these environment variables:

- \`DB_HOST\`, \`DB_PORT\`, \`DB_USER\`, \`DB_PASSWORD\`, \`DB_NAME\`
- \`REDIS_URL\`
- \`NODE_ENV\`
`
  );

  console.log(`✅ Generated ${serviceName} service in ./${serviceName}/`);
  console.log(`
📁 Service structure:
  ${serviceName}/
  ├── src/
  │   ├── service-config.ts    # Service configuration
  │   ├── bin/worker.ts        # Worker entry point
  │   ├── adapters/           # Adapters (TODO)
  │   ├── core/               # Business logic (TODO)
  │   └── config/             # Configuration (TODO)
  ├── sql/init.sql            # Database schema (TODO)
  ├── tests/                  # Tests (TODO)  
  ├── package.json
  ├── tsconfig.json
  └── README.md

🚀 Next steps:
  1. cd ${serviceName}
  2. npm install
  3. Implement your business logic in service-config.ts
  4. Add repositories and external clients as needed
  5. npm run dev
`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const serviceName = args[0];

  if (!serviceName) {
    console.error("Usage: ts-node generator.ts <service-name> [options]");
    console.error("Options:");
    console.error("  --subscribes=event1,event2  Events to subscribe to");
    console.error("  --publishes=event1,event2   Events to publish");
    console.error("  --no-database              Skip database setup");
    console.error("  --cache=redis|memory        Cache type (default: redis)");
    process.exit(1);
  }

  const options: GeneratorOptions = {
    name: serviceName,
    subscribes: args
      .find((arg) => arg.startsWith("--subscribes="))
      ?.split("=")[1]
      ?.split(","),
    publishes: args
      .find((arg) => arg.startsWith("--publishes="))
      ?.split("=")[1]
      ?.split(","),
    database: !args.includes("--no-database"),
    cache:
      (args.find((arg) => arg.startsWith("--cache="))?.split("=")[1] as
        | "redis"
        | "memory") || "redis",
  };

  generateService(options);
}
