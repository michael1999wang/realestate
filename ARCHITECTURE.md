⸻

# System Architecture (Summary for Cursor)

## Core idea

    •	We run multiple independent services (Ingestor, Enrichment, Rent Estimator, Underwriting, Alerts, Web App/BFF).
    •	They communicate asynchronously via one shared event bus per environment (dev/stage/prod).
    •	Each service publishes and subscribes to specific topics on the same bus (Redis Streams in dev), using consumer groups for scaling and at-least-once delivery.

## Event bus

    •	Bus: Redis Streams (dev/MVP). In prod you can swap to NATS/Kafka/SQS with the same ports.
    •	Connection: All services use the same REDIS_URL.
    •	Isolation: By topic/stream names + consumer groups (not separate buses).
    •	DLQ: Each topic has a .dlq companion stream.

## Topics (streams)

```
listings.changed
underwrite.requested
underwrite.completed
alerts.fired
```

## Message envelope (v1)

```json
{
  "id": "uuid-v7",
  "type": "listings.changed | underwrite.requested | ...",
  "ts": "2025-08-19T15:04:05.123Z",
  "source": "service-name",
  "subject": "listing:<id>",
  "data": {
    /* event-specific payload */
  },
  "meta": { "schema": "v1", "traceId": "...", "attempt": 1 }
}
```

## Who publishes / who listens

1. **Ingestor**
   • Publishes: `listings.changed`
   • data = `{ id, updatedAt, change: "create|update|status_change", dirty: ["price","status","fees","tax","media","address"] }`
   • Subscribes: (none required)

2. **Enrichment**
   • Subscribes: `listings.changed` (group: enrichment)
   • Work: geocode, taxes/fees normalization, rent priors, location scores
   • Publishes: `underwrite.requested { id }` (when financial inputs relevantly changed)

3. **Rent Estimator**
   • Subscribes: `listings.changed` (group: rent)
   (or data_enriched if you add that topic later)
   • Work: priors + comps → rent_estimates
   • Publishes: `underwrite.requested { id }` (when rent estimate changes materially)

4. **Underwriting**
   • Subscribes:
   • `underwrite.requested` (group: underwriting)
   • `listings.changed` (optional; recompute grid if financial inputs changed)
   • Work: compute metrics (NOI, DSCR, CoC, cash flow, cap, optional IRR)
   • Writes: underwrite_grid (shared bins) and/or underwrite_exact (exact cache)
   • Publishes: `underwrite.completed { id, resultId, source: "grid|exact", score? }`

5. **Alerts**
   • Subscribes: `underwrite.completed` (group: alerts)
   • Work: match against saved_searches (filters + thresholds), create alert records
   • Publishes: `alerts.fired { userId, listingId, resultId }`
   • Dev delivery: also pushes to SSE browser page

6. **Web App / BFF (HTTP, not on bus)**
   • Calls: read APIs (search listings, detail), on-demand /underwrite (exact)
   • Listens (dev only): SSE endpoint from Alerts service for live alert cards

## Local dev (single shared bus)

```yaml
# docker-compose.yml (bus only)
services:
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports: ["6379:6379"]
```

    •	All services set REDIS_URL=redis://localhost:6379.
    •	Each service creates/uses its own consumer group on the topics it cares about.

## Consumer groups (recommended)

```
enrichment  -> listings.changed
rent        -> listings.changed
underwriting-> underwrite.requested
alerts      -> underwrite.completed
```

## Delivery semantics & patterns

    •	At-least-once: consumers must be idempotent (e.g., ignore same {listingId, updatedAt} twice).
    •	Ordering: not guaranteed globally; shard by listingId if required.
    •	Retries/DLQ: N failures → add to <topic>.dlq. Monitor DLQ size.
    •	Debounce: coalesce bursts per listing for 30–60s, except for critical dirty like price/status.

## Minimal contracts per event (data field)

    •	`listings.changed`

```json
{ "id": "...", "updatedAt": "...", "change": "...", "dirty?": ["price"|"status"|"fees"|"tax"|"media"|"address"] }
```

    •	`underwrite.requested`

```json
{ "id": "...", "assumptionsId?": "string" }
```

    •	`underwrite.completed`

```json
{ "id": "...", "resultId": "...", "source": "grid|exact", "score?": 0.8 }
```

    •	`alerts.fired` (optional external integrations)

```json
{
  "userId": "...",
  "listingId": "...",
  "resultId": "...",
  "channel?": "email|sms|slack|webhook"
}
```

## Acceptance checks (dev)

    1.	Start bus: `docker compose up -d redis`.
    2.	Run services: Ingestor → Enrichment → Rent → Underwriting → Alerts.
    3.	Editing a fixture's listPrice:
    •	Ingestor emits `listings.changed` (dirty:["price"])
    •	Enrichment (and/or Rent) emits `underwrite.requested`
    •	Underwriting writes grid/exact → emits `underwrite.completed`
    •	Alerts matches searches → SSE alert appears in dev browser

⸻

## Key takeaway for Cursor:

All services point to the same event bus and use different topics (and consumer groups) to decouple responsibilities. Keep the message envelope consistent, versioned, and idempotent.

# Generic Service Template Architecture

## Problem

Current services have significant boilerplate code for:

- Database connections & lifecycle management
- Redis bus setup & event subscriptions
- Configuration management
- Health checks & metrics
- Graceful shutdown
- Error handling patterns

## Solution: BaseService Template

Create a generic `BaseService` abstract class that handles all infrastructure concerns while allowing services to define their business logic through a simple configuration-driven approach.

## Service Configuration Schema

```typescript
interface ServiceConfig<TDeps = any, TEventMap = any> {
  name: string;
  version: string;

  // Infrastructure needs
  database?: DatabaseConfig;
  cache?: CacheConfig;
  external?: ExternalAPIConfig[];

  // Event configuration
  subscriptions: EventSubscription<TEventMap>[];
  publications?: EventPublication[];

  // Business logic factories
  createBusinessLogic: (deps: TDeps) => BusinessLogic<TEventMap>;
  createRepositories?: (pool: Pool) => RepositoryMap;
  createExternalClients?: (config: ExternalAPIConfig[]) => ClientMap;
}

interface EventSubscription<T> {
  topic: keyof T;
  handler: keyof BusinessLogic<T>; // Method name on business logic class
  consumerGroup?: string;
  options?: {
    debounce?: number;
    retries?: number;
  };
}

interface BusinessLogic<TEventMap> {
  // Event handlers are defined as methods
  [K in keyof TEventMap as `handle${Capitalize<string & K>}`]: (event: TEventMap[K]) => Promise<void>;
}
```

## Example Service Definition

```typescript
// underwriting-service.ts
const underwritingConfig: ServiceConfig<UnderwritingDeps, UnderwritingEvents> =
  {
    name: "underwriting",
    version: "1.0.0",

    database: {
      schema: "underwriting_schema.sql",
    },

    cache: {
      type: "redis",
    },

    subscriptions: [
      {
        topic: "underwrite_requested",
        handler: "handleUnderwriteRequested",
        consumerGroup: "underwriting",
        options: { retries: 3 },
      },
      {
        topic: "listings_changed",
        handler: "handleListingChanged",
        consumerGroup: "underwriting_listings",
      },
    ],

    publications: [{ topic: "underwrite_completed" }],

    createBusinessLogic: (deps) => new UnderwritingBusinessLogic(deps),
    createRepositories: (pool) => ({
      snapshots: new SnapshotsRepo(pool),
      assumptions: new AssumptionsRepo(pool),
      underwriting: new UWRepo(pool),
      factors: new FactorsRepo(pool),
    }),
  };

class UnderwritingBusinessLogic implements BusinessLogic<UnderwritingEvents> {
  constructor(private deps: UnderwritingDeps) {}

  async handleUnderwriteRequested(
    event: UnderwriteRequestedEvent
  ): Promise<void> {
    // Pure business logic - no infrastructure concerns
    const result = await computeUnderwriting(event.id, this.deps);

    if (result.changed) {
      await this.deps.bus.publish("underwrite_completed", {
        id: event.id,
        resultId: result.resultId,
        source: result.source,
      });
    }
  }

  async handleListingChanged(event: ListingChangedEvent): Promise<void> {
    // Handle listing changes that might affect underwriting
  }
}

// Start the service
const service = new BaseService(underwritingConfig);
service.start();
```

## Benefits

1. **Dramatic Code Reduction**: ~80% less boilerplate per service
2. **Consistent Patterns**: All services follow the same lifecycle & error handling
3. **Easy Testing**: Business logic is pure, infrastructure is mocked
4. **Configuration-Driven**: Event routing defined declaratively
5. **Type Safety**: Full TypeScript support with event type mapping
6. **Standardized Metrics**: Built-in observability across all services
7. **Rapid Development**: New services can be created in minutes

## Implementation Plan

1. Create `BaseService` class in shared-utils
2. Define service configuration schemas
3. Refactor one service (Alerts) as proof of concept
4. Create service generator CLI tool
5. Migrate remaining services incrementally

This approach maintains the flexibility for complex business logic while eliminating repetitive infrastructure code.
