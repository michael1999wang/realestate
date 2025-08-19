# Real Estate Ingestor

A robust, scalable system for ingesting and normalizing real estate listing data from TRREB, CREA, and other MLS sources.

## 🎯 Features

- **Delta Updates**: Efficiently polls for listings updated since the last watermark
- **Normalization**: Converts raw MLS data to stable, consistent DTOs
- **Idempotent**: Prevents duplicate processing and events
- **Paginated**: Handles large datasets with configurable page sizes
- **Observable**: Publishes structured events for downstream processing
- **Pluggable**: Adapter pattern for sources, storage, and event buses
- **Testable**: Comprehensive test suite with 46 passing tests

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Source    │───▶│   Poller     │───▶│    Repo     │
│  (TRREB)    │    │   (Core)     │    │ (Storage)   │
└─────────────┘    └──────────────┘    └─────────────┘
                           │
                           ▼
                   ┌──────────────┐
                   │     Bus      │
                   │  (Events)    │
                   └──────────────┘
```

### Core Components

- **Poller**: Orchestrates the ingestion process
- **Normalizer**: Converts raw data to standard Listing DTOs
- **Source Adapters**: Fetch data from different MLS systems
- **Repository Adapters**: Store listings and manage watermarks
- **Bus Adapters**: Publish change events

## 🚀 Quick Start

### One-Command Startup

```bash
# Install dependencies
npm install

# Start everything (database + ingestor) with one command
npm run start:all

# Or with specific adapter
ADAPTER=SQL npm run start:all
ADAPTER=MOCK npm run start:all
```

### Development Mode (Mock Data)

```bash
# Run with mock data only (no database management)
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

### Production Setup

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
vim .env

# Start everything with SQL adapter
ADAPTER=SQL npm run start:all

# Or manually manage database
npm run start:db        # Start database only
ADAPTER=SQL npm run dev # Start ingestor only
npm run stop:db         # Stop database
```

## 📊 Configuration

### Environment Variables

| Variable           | Default  | Description                            |
| ------------------ | -------- | -------------------------------------- |
| `MODE`             | `dev`    | Application mode                       |
| `ADAPTER`          | `MOCK`   | Source adapter (MOCK/SELENIUM/DDF/SQL) |
| `POLL_INTERVAL_MS` | `300000` | Poll interval (5 minutes)              |
| `PAGE_SIZE`        | `25`     | Items per page                         |
| `BUS_ADAPTER`      | `LOG`    | Event bus type (LOG/SQS)               |

### Adapters

**Source Adapters:**

- `MOCK`: Uses fixture data for development
- `SELENIUM`: Web scraping (placeholder)
- `DDF`: CREA OData feed (placeholder)

**Repository Adapters:**

- `MEMORY`: In-memory storage (default for dev)
- `SQL`: PostgreSQL storage

**Bus Adapters:**

- `LOG`: Console logging (default)
- `SQS`: AWS SQS (placeholder)

### Available Scripts

| Script               | Description                               |
| -------------------- | ----------------------------------------- |
| `npm run start:all`  | 🚀 Start everything (database + ingestor) |
| `npm run dev`        | 🏗️ Start ingestor only (no DB management) |
| `npm run start:db`   | 🐘 Start PostgreSQL database only         |
| `npm run stop:db`    | 🛑 Stop database                          |
| `npm test`           | 🧪 Run test suite                         |
| `npm run test:watch` | 👀 Run tests in watch mode                |
| `npm run lint`       | 🔍 Lint code                              |
| `npm run build`      | 📦 Build TypeScript                       |

**Quick Examples:**

```bash
# Development with mock data
npm run start:all

# Production with database
ADAPTER=SQL npm run start:all

# Fast polling for testing
ADAPTER=MOCK POLL_INTERVAL_MS=5000 npm run start:all

# Get help
npm run start:all -- --help
```

## 📝 Data Flow

1. **Poll**: Fetch listings updated since watermark
2. **Normalize**: Convert raw data to standard format
3. **Detect Changes**: Compare with existing data
4. **Store**: Upsert listings to repository
5. **Publish**: Emit events for real changes only
6. **Update Watermark**: Advance to latest timestamp

## 🧪 Testing

The system includes comprehensive tests covering:

- **Normalization**: Raw data → Listing DTOs
- **Repository**: CRUD operations and change detection
- **Source Adapters**: Pagination and filtering
- **Poller**: End-to-end integration
- **Idempotency**: No duplicate events

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## 📋 API Reference

### Core Types

```typescript
interface Listing {
  id: string;
  mlsNumber?: string;
  sourceBoard: "TRREB" | "CREA" | "MOCK";
  status: ListingStatus;
  listedAt: ISO;
  updatedAt: ISO;
  address: Address;
  propertyType: PropertyType;
  beds: number;
  baths: number;
  listPrice: Money;
  // ... additional fields
}

interface ListingChangedEvent {
  type: "listing_changed";
  id: string;
  change: "create" | "update" | "status_change";
  source: string;
  dirty?: DirtyField[];
}
```

### Ports (Interfaces)

```typescript
interface SourcePort {
  fetchUpdatedSince(
    since: string,
    pageToken?: string
  ): Promise<{
    items: any[];
    nextPage?: string;
    maxUpdatedAt: string;
  }>;
}

interface RepoPort {
  getWatermark(source: string): Promise<string | null>;
  setWatermark(source: string, watermark: string): Promise<void>;
  upsert(listing: Listing): Promise<UpsertResult>;
}

interface BusPort {
  publish(evt: ListingChangedEvent): Promise<void>;
}
```

## 🗄️ Database Schema

```sql
CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  mls_number TEXT,
  source_board TEXT NOT NULL,
  status TEXT NOT NULL,
  listed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  address JSONB NOT NULL,
  property_type TEXT NOT NULL,
  beds INT NOT NULL,
  baths INT NOT NULL,
  list_price NUMERIC NOT NULL,
  -- ... additional columns
  updated_row_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sync_state (
  source TEXT PRIMARY KEY,
  watermark TIMESTAMPTZ NOT NULL
);
```

## 📈 Observability

### Structured Logging

```json
{
  "timestamp": "2024-01-19T22:03:24.868Z",
  "event": "listing_changed",
  "listingId": "C5123456",
  "change": "create",
  "source": "TRREB",
  "updatedAt": "2024-01-15T08:00:00Z",
  "dirtyFields": ["price", "status"]
}
```

### Metrics (Future)

- `ingest_items_total`: Total items processed
- `ingest_changed_total`: Items that changed
- `ingest_errors_total`: Processing errors
- `ingest_duration_seconds`: Poll duration

## 🔧 Development

### Project Structure

```
ingestor/
├── src/
│   ├── core/           # Business logic
│   │   ├── dto.ts      # Data types
│   │   ├── ports.ts    # Interfaces
│   │   ├── normalize.ts # Data normalization
│   │   ├── poller.ts   # Main orchestration
│   │   └── utils.ts    # Utilities
│   ├── adapters/       # Implementation
│   │   ├── source.*    # Source adapters
│   │   ├── repo.*      # Repository adapters
│   │   └── bus.*       # Event bus adapters
│   ├── config/         # Configuration
│   └── bin/            # Entry points
├── fixtures/           # Test data
├── tests/             # Test suite
└── sql/               # Database schema
```

### Adding New Sources

1. Implement `SourcePort` interface
2. Add configuration options
3. Register in adapter factory
4. Add tests

### Adding New Repositories

1. Implement `RepoPort` interface
2. Handle change detection logic
3. Add database migrations if needed
4. Add tests

## 🚀 Deployment

### Docker Database

```bash
# Start local Postgres
docker compose up -d db

# Connect to database
psql -h localhost -p 5433 -U ingestor -d ingestor_dev
```

### Production Considerations

- Set up monitoring and alerting
- Configure log aggregation
- Use environment-specific configs
- Set up database backups
- Monitor resource usage
- Implement circuit breakers

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

---

Built with ❤️ for the real estate industry
