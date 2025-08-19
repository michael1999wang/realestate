# Rent Estimator Service

A microservice that estimates rental prices for real estate listings using a layered approach combining priors, comparable rentals, and optional ML models.

## Features

- **Layered Estimation**: Uses priors (city/FSA + beds/type) as baseline, nearby rental comps when available, and optional ML models
- **Event-Driven**: Consumes `listing_changed` and `data_enriched` events, publishes `underwrite_requested` when estimates change materially
- **Debouncing**: Prevents excessive processing unless address changes
- **Caching**: Redis-based caching for priors and intermediate results
- **Uncertainty Bands**: Provides p25, p50, p75 estimates with standard deviation
- **Material Change Detection**: Only publishes events when rent estimates change by ≥3%

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ listing_changed │───▶│  Rent Estimator  │───▶│underwrite_req'd │
│ data_enriched   │    │     Worker       │    │     Event       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Dependencies   │
                    │ • Read Port      │
                    │ • Priors Source  │
                    │ • Comps Source   │
                    │ • Cache (Redis)  │
                    │ • Database (PG)  │
                    └──────────────────┘
```

## Quick Start

### 1. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify services are healthy
docker-compose ps
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### 5. Start the Worker

```bash
# Development mode (uses memory adapters)
USE_MEMORY=true npm run dev

# Production mode (uses SQL + Redis)
npm run dev
```

## Configuration

Environment variables:

| Variable                    | Default                  | Description                          |
| --------------------------- | ------------------------ | ------------------------------------ |
| `DB_HOST`                   | `localhost`              | PostgreSQL host                      |
| `DB_PORT`                   | `5435`                   | PostgreSQL port                      |
| `DB_USER`                   | `rent`                   | PostgreSQL username                  |
| `DB_PASSWORD`               | `rent`                   | PostgreSQL password                  |
| `DB_NAME`                   | `rent_dev`               | PostgreSQL database                  |
| `REDIS_URL`                 | `redis://localhost:6379` | Redis connection URL                 |
| `USE_MEMORY`                | `false`                  | Use memory adapters for testing      |
| `MATERIAL_CHANGE_THRESHOLD` | `0.03`                   | Threshold for material changes (3%)  |
| `DEBOUNCE_TTL_SEC`          | `60`                     | Debounce period in seconds           |
| `CACHE_TTL_SEC`             | `86400`                  | Cache TTL in seconds (24 hours)      |
| `COMPS_RADIUS_KM`           | `2.0`                    | Search radius for comps              |
| `COMPS_DAYS_BACK`           | `120`                    | How far back to search for comps     |
| `COMPS_MAX`                 | `15`                     | Maximum comps to include in estimate |

## API Contracts

### Input Events

#### listing_changed

```json
{
  "type": "listing_changed",
  "id": "listing-123",
  "updatedAt": "2024-01-15T10:00:00Z",
  "change": "update",
  "source": "TRREB",
  "dirty": ["address", "price"]
}
```

#### data_enriched

```json
{
  "type": "data_enriched",
  "id": "listing-123",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

### Output Events

#### underwrite_requested

```json
{
  "type": "underwrite_requested",
  "id": "listing-123",
  "assumptionsId": "optional-assumptions-id"
}
```

### Rent Estimate Output

```json
{
  "listingId": "listing-123",
  "listingVersion": 1,
  "estimatorVersion": "1.0.0",
  "method": "comps",
  "p25": 2800,
  "p50": 3200,
  "p75": 3600,
  "stdev": 200,
  "featuresUsed": {
    "beds": 2,
    "baths": 2,
    "sqft": 900,
    "propertyType": "Condo",
    "city": "Toronto",
    "fsa": "M5V",
    "comps": [
      {
        "id": "comp-1",
        "rent": 3100,
        "beds": 2,
        "baths": 2,
        "sqft": 850,
        "distanceKm": 0.5,
        "daysOld": 15
      }
    ],
    "priors": {
      "source": "cmhc",
      "city": "Toronto",
      "fsa": "M5V",
      "asOf": "2024-01-01",
      "p25": 3000,
      "p50": 3400,
      "p75": 3800
    }
  },
  "computedAt": "2024-01-15T10:00:00Z"
}
```

## Estimation Methods

### 1. Priors Only (`method: "priors"`)

- Uses city/FSA + beds/property type baseline
- Fallback when no comparable rentals available
- Sources: CMHC data or local lookup tables

### 2. Comparable Rentals (`method: "comps"`)

- Searches recent rentals within radius (default 2km, 120 days)
- Filters by similarity: ±1 bed/bath, ±20% sqft
- Weights by distance and recency
- Blends with priors using shrinkage (more comps = higher weight)

### 3. ML Model (`method: "model"`)

- Future extension for XGBoost/CatBoost models
- Would use historical rental data for training
- Feature flags to force specific methods

## Database Schema

```sql
CREATE TABLE rent_estimates (
  listing_id TEXT PRIMARY KEY,
  listing_version INT NOT NULL,
  estimator_version TEXT NOT NULL,
  method TEXT NOT NULL,
  p25 NUMERIC,
  p50 NUMERIC NOT NULL,
  p75 NUMERIC,
  stdev NUMERIC,
  features_used JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_row_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON rent_estimates ((features_used->>'city'));
CREATE INDEX ON rent_estimates ((features_used->>'fsa'));
```

## Development

### Project Structure

```
rent-estimator/
├── src/
│   ├── core/           # Business logic
│   │   ├── dto.ts      # Data types
│   │   ├── ports.ts    # Interfaces
│   │   ├── estimate.ts # Main estimation logic
│   │   ├── combine.ts  # Statistical combination
│   │   ├── debounce.ts # Event debouncing
│   │   └── versioning.ts
│   ├── adapters/       # External integrations
│   │   ├── repo.sql.ts     # PostgreSQL repository
│   │   ├── repo.memory.ts  # In-memory repository
│   │   ├── cache.redis.ts  # Redis cache
│   │   ├── cache.memory.ts # In-memory cache
│   │   ├── bus.redis.ts    # Redis event bus
│   │   ├── bus.memory.ts   # In-memory bus
│   │   ├── priors.source.ts # Mock priors source
│   │   ├── comps.source.ts  # Mock comps source
│   │   └── read.mock.ts     # Mock data reader
│   ├── config/
│   │   └── env.ts      # Environment configuration
│   └── bin/
│       └── worker.ts   # Main worker process
├── tests/              # Unit tests
├── sql/               # Database migrations
├── docker-compose.yml # Local development setup
└── package.json
```

### Testing

The service includes comprehensive unit tests covering:

- **Estimation Logic**: Various scenarios for priors-only, comps-only, and blended estimates
- **Statistical Functions**: Weighted medians, percentiles, standard deviation
- **Repository Operations**: CRUD operations with change detection
- **Event Handling**: Debouncing, material change detection
- **Integration**: End-to-end estimation flows

### Observability

The worker logs structured information for each processed listing:

```json
{
  "listingId": "listing-123",
  "method": "comps",
  "comps_n": 5,
  "p50": 3200,
  "changed": true,
  "durationMs": 45
}
```

Future extensions will include metrics:

- `rent_estimate_requests_total`
- `rent_estimate_changed_total`
- `rent_estimate_errors_total`
- Cache hit/miss rates

## Production Deployment

1. **Database Migration**: Run `sql/init.sql` against production database
2. **Environment**: Set production environment variables
3. **Scaling**: Run multiple worker instances with different consumer group names
4. **Monitoring**: Set up health checks on `/health` endpoint (future)
5. **Alerting**: Monitor error rates and processing latency

## Future Extensions

- **ML Models**: Integrate XGBoost/CatBoost for advanced estimation
- **Postal Code Centroids**: Use FSA centroids when lat/lng unavailable
- **Outlier Detection**: IQR rule or Hampel filter for comp cleaning
- **Feature Flags**: Force estimation methods via environment variables
- **Real Data Sources**: Replace mock adapters with actual CMHC/MLS feeds
- **API Endpoints**: REST API for on-demand estimates
- **Batch Processing**: Bulk re-estimation capabilities
