# Service Template Guide

## Overview

The `BaseService` template dramatically reduces boilerplate code for event-driven microservices by providing a standardized infrastructure layer while keeping business logic pure and testable.

## Benefits

- **~90% less boilerplate code** per service
- **Consistent patterns** across all services
- **Built-in observability** (metrics, health checks, logging)
- **Graceful shutdown** handling
- **Type-safe event handling**
- **Easy testing** with pure business logic
- **Configuration-driven** service definition

## Quick Start

### 1. Define Your Events

```typescript
interface MyServiceEventMap {
  some_event: {
    id: string;
    data: any;
  };
  another_event: {
    userId: string;
    action: string;
  };
}
```

### 2. Create Business Logic

```typescript
class MyBusinessLogic {
  constructor(private deps: MyServiceDependencies) {}

  // Handler methods must follow naming convention: handle{EventType}
  async handleSomeEvent(event: MyServiceEventMap["some_event"]): Promise<void> {
    // Pure business logic - no infrastructure concerns
    await this.processEvent(event);

    // Publish follow-up events if needed
    await this.deps.bus.publish("another_event", {
      userId: event.userId,
      action: "processed",
    });
  }
}
```

### 3. Configure Service

```typescript
const myServiceConfig: ServiceConfig<MyServiceDeps, MyServiceEventMap> = {
  name: "my-service",
  version: "1.0.0",

  database: {
    /* db config */
  },
  cache: { type: "redis" },

  subscriptions: [
    {
      topic: "some_event",
      handler: "handleSomeEvent",
      consumerGroup: "my-service",
      options: { retries: 3, debounce: 1000 },
    },
  ],

  publications: [{ topic: "another_event" }],

  createBusinessLogic: (deps) => new MyBusinessLogic(deps),
  createRepositories: (pool) => ({
    /* repositories */
  }),
  createExternalClients: () => ({
    /* clients */
  }),
};
```

### 4. Create Service Class

```typescript
export class MyService extends BaseService<MyServiceDeps, MyServiceEventMap> {
  constructor() {
    super(myServiceConfig);
  }
}
```

### 5. Simple Worker Entry Point

```typescript
#!/usr/bin/env node

import { MyService } from "../service-config";

async function main() {
  const service = new MyService();
  await service.start();
}

main().catch((error) => {
  console.error("Failed to start service:", error);
  process.exit(1);
});
```

## Configuration Options

### Database Configuration

```typescript
database: {
  schema: 'path/to/schema.sql',  // Optional initialization script
  pool: {
    max: 10,                     // Max connections
    idleTimeoutMillis: 30000,    // Idle timeout
    connectionTimeoutMillis: 5000 // Connection timeout
  }
}
```

### Event Subscriptions

```typescript
subscriptions: [
  {
    topic: "event_name", // Event to listen to
    handler: "handleEventName", // Method name in business logic
    consumerGroup: "my-group", // Consumer group (optional)
    options: {
      debounce: 1000, // Debounce in ms (optional)
      retries: 3, // Max retries (optional)
      dlqTopic: "event.dlq", // Dead letter queue (optional)
    },
  },
];
```

### Health Checks

```typescript
healthCheck: {
  intervalMs: 30000,            // Check interval
  customChecks: [
    {
      name: 'external_api',
      check: async () => {
        // Return true if healthy, false if unhealthy
        return await checkExternalAPI();
      }
    }
  ]
}
```

## Environment Variables

The BaseService automatically reads these environment variables:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `REDIS_URL`
- `BUS_TYPE` (redis|memory)
- `NODE_ENV`

## Migration Example: Before & After

### Before (Original Alerts Worker)

```typescript
// 127 lines of infrastructure boilerplate
async function main(): Promise<void> {
  console.log("Starting Alerts Worker...");

  // Initialize adapters
  const sharedBus = createBus({
    type: "redis",
    serviceName: "alerts",
    redisUrl: cfg.redisUrl,
  });
  const bus = new BusAdapter(sharedBus);

  let repo;
  if (cfg.mode === "dev") {
    repo = new MemoryAlertsRepo([
      /* test data */
    ]);
  } else {
    const pool = new Pool({
      host: cfg.db.host,
      port: cfg.db.port,
      user: cfg.db.user,
      password: cfg.db.password,
      database: cfg.db.name,
    });
    repo = new PostgresAlertsRepo(pool);
  }

  const readAdapter = new MockReadAdapter(/* data */);
  const dispatcher = new MultiChannelDispatcher(sendDevBrowser);
  const handlers = createHandlers({
    bus,
    read: readAdapter,
    repo,
    dispatch: dispatcher,
  });

  // Subscribe to events
  await bus.subscribe("underwrite_completed", handlers.onUnderwriteCompleted);
  await bus.subscribe("property_scored", handlers.onPropertyScored);

  // Start HTTP server in dev mode
  if (cfg.mode === "dev") {
    // More boilerplate...
  }

  // Keep process alive and handle shutdown
  process.on("SIGINT", () => {
    console.log("Shutting down alerts worker...");
    process.exit(0);
  });
}
```

### After (Template-Based)

```typescript
// 12 lines total
import { AlertsService } from "../service-config";

async function main() {
  const service = new AlertsService();
  await service.start();
}

main().catch((error) => {
  console.error("Failed to start alerts service:", error);
  process.exit(1);
});
```

## Best Practices

### 1. Keep Business Logic Pure

```typescript
// ✅ Good - Pure function, easy to test
async handleEvent(event: SomeEvent): Promise<void> {
  const result = await this.computeSomething(event.data);
  await this.deps.repo.save(result);
}

// ❌ Bad - Mixed concerns, hard to test
async handleEvent(event: SomeEvent): Promise<void> {
  const pool = new Pool({...}); // Infrastructure concern
  const client = await pool.connect();
  // Business logic mixed with infrastructure
}
```

### 2. Use Type-Safe Event Maps

```typescript
// Define all events your service handles
interface MyServiceEventMap {
  order_created: { orderId: string; userId: string; items: Item[] };
  payment_processed: { orderId: string; amount: number; currency: string };
  inventory_updated: { productId: string; quantity: number };
}
```

### 3. Handle Errors Gracefully

```typescript
async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
  try {
    await this.processOrder(event);
  } catch (error) {
    // Log error - BaseService handles metrics automatically
    this.deps.logger.error('Failed to process order', error);

    // Optionally publish error event
    await this.deps.bus.publish('order_processing_failed', {
      orderId: event.orderId,
      error: error.message
    });

    throw error; // Re-throw for retry logic
  }
}
```

### 4. Use Repositories for Data Access

```typescript
createRepositories: (pool) => ({
  orders: new OrdersRepository(pool),
  customers: new CustomersRepository(pool),
  products: new ProductsRepository(pool),
});
```

## Testing

Business logic becomes trivial to test since it's pure:

```typescript
describe("OrderBusinessLogic", () => {
  it("should process order correctly", async () => {
    const mockDeps = {
      bus: mockBus,
      repositories: { orders: mockOrdersRepo },
      logger: mockLogger,
    };

    const logic = new OrderBusinessLogic(mockDeps);
    await logic.handleOrderCreated(mockEvent);

    expect(mockOrdersRepo.save).toHaveBeenCalled();
    expect(mockBus.publish).toHaveBeenCalledWith(
      "order_processed",
      expect.any(Object)
    );
  });
});
```

## Service Generator (Future)

We can create a CLI tool to generate services:

```bash
npx @realestate/create-service my-new-service \
  --subscribes=listings.changed,user.created \
  --publishes=my-service.completed \
  --database=true \
  --cache=redis
```

This would generate the entire service structure with proper types and configuration.
