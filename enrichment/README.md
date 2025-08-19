# Enrichment Service

A microservice that consumes `listing_changed` events and enriches listings with market data, geocoding, taxes, rent priors, location scores, and cost rules.

## 🎯 Mission

Consume `listing_changed` events, fetch/derive market/context data (taxes, priors, scores, geocoding), and upsert a normalized Enrichment record per listing. Optionally publish `underwrite_requested` when financially relevant fields change.

### Primary Outputs per Listing

- **geo**: lat/lng (or geocoded), neighborhood/FSA
- **tax**: annual property tax estimate (or exact if available)
- **fees**: condo/hoa normalization (carry-through + sanity checks)
- **rent_priors**: city/FSA P25/P50/P75 monthly rent priors (CMHC or table)
- **location_scores**: Walk/Transit/Bike (if lat/lng present)
- **cost_rules**: land transfer tax rule key, insurance proxy
- **enrichment_version**: semantic version to invalidate downstream caches

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 16+ (via Docker)
- Redis 7+ (via Docker)

### Development Setup

1. **Clone and install dependencies:**

   ```bash
   cd enrichment
   npm install
   ```

2. **Start infrastructure:**

   ```bash
   docker compose up -d
   ```

3. **Copy environment configuration:**

   ```bash
   cp .env.example .env
   # Edit .env as needed
   ```

4. **Run tests:**

   ```bash
   npm test
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

## 🏗️ Architecture

### Core Components

- **EnrichmentScheduler**: Handles event debouncing and orchestration
- **Debouncer**: Prevents excessive processing with smart timeouts
- **enrichOne**: Core enrichment logic with caching
- **Ports & Adapters**: Clean architecture with swappable implementations

### Data Flow

```
listing_changed event → Debouncer → enrichOne → EnrichmentRepo → underwrite_requested (optional)
                                      ↓
                            External APIs (cached)
                            - WalkScore
                            - CMHC
                            - Geocoding
                            - Tax Tables
```

### Debounce Logic

- **Immediate Processing**: `price`, `fees`, `tax`, `address` changes
- **Debounced (30s)**: Other field changes to reduce API calls
- **Configurable**: Via `DEBOUNCE_TIMEOUT_SEC` environment variable

## 📊 Database Schema

```sql
CREATE TABLE enrichments (
  listing_id TEXT PRIMARY KEY,
  listing_version INT NOT NULL,
  enrichment_version TEXT NOT NULL,
  geo JSONB,
  taxes JSONB,
  fees JSONB,
  rent_priors JSONB,
  location_scores JSONB,
  cost_rules JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_row_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 🔧 Configuration

### Environment Variables

```bash
# Application
MODE=dev
LOG_LEVEL=info
DEBOUNCE_TIMEOUT_SEC=30

# Database
DB_HOST=localhost
DB_PORT=5434
DB_USER=enrichment
DB_PASSWORD=enrichment
DB_NAME=enrichment_dev

# Cache
REDIS_HOST=localhost
REDIS_PORT=6380

# External APIs
WALKSCORE_KEY=your_api_key
GEOCODE_PROVIDER=mock|google|mapbox
GEOCODE_KEY=your_api_key
CMHC_MODE=mock|live
```

### Docker Services

- **PostgreSQL**: Port 5434 (to avoid conflicts)
- **Redis**: Port 6380 (to avoid conflicts)
- **Volumes**: Persistent data storage

## 🧪 Testing

### Unit Tests

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
```

### Test Coverage

- ✅ Core enrichment logic
- ✅ Memory repositories
- ✅ Mock API clients
- ✅ Debounce functionality
- ✅ Idempotency guarantees

### Test Listings

The dev worker seeds mock listings:

- `listing-toronto-1`: Downtown Toronto condo with coordinates
- `listing-toronto-2`: Toronto apartment (geocoded)
- `listing-vancouver-1`: Vancouver condo

## 📈 Monitoring & Observability

### Metrics

The scheduler tracks:

- `eventsReceived`: Total events consumed
- `eventsProcessed`: Events that passed debounce
- `enrichmentsChanged`: Actual database updates
- `underwriteRequestsPublished`: Downstream events
- `errors`: Processing failures

### Health Checks

- Database connectivity
- Redis connectivity
- Processing metrics
- Error rates

### Logging

Structured JSON logs with:

- Timestamp
- Log level
- Service identifier
- Request context
- Performance metrics

## 🔄 Event Processing

### Input Event Format

```typescript
{
  type: "listing_changed",
  id: "listing-123",
  updatedAt: "2024-01-01T00:00:00Z",
  change: "create" | "update" | "status_change",
  source: "TRREB" | "CREA" | "MOCK",
  dirty?: ["price", "status", "fees", "tax", "media", "address"]
}
```

### Output Event Format

```typescript
{
  type: "underwrite_requested",
  id: "listing-123",
  assumptionsId?: "optional-id"
}
```

## 🏙️ Supported Locations

### Tax Rates

- **Ontario**: Toronto, Mississauga, Brampton, Hamilton, London, Markham, Vaughan, Kitchener, Windsor, Richmond Hill
- **British Columbia**: Vancouver, Surrey, Burnaby, Richmond, Coquitlam
- **Alberta**: Calgary, Edmonton
- **Quebec**: Montreal, Quebec City, Laval
- **Other Provinces**: Default rates available

### Rent Priors

Mock CMHC data for major Canadian cities with property type adjustments.

### Location Scores

WalkScore integration (mock mode available) for walkability, transit, and bike scores.

## 🚢 Production Deployment

### Message Bus

Replace `LogBus` with `SQSBus` for production:

```typescript
const bus = new SQSBus({
  region: "us-east-1",
  // AWS credentials via IAM roles
});
```

### External APIs

1. **WalkScore**: Set `WALKSCORE_KEY` for live scores
2. **Geocoding**: Set `GEOCODE_PROVIDER=google` and `GEOCODE_KEY`
3. **CMHC**: Set `CMHC_MODE=live` for real rent data

### Scaling

- Horizontal scaling via multiple worker instances
- Redis-based debouncing works across instances
- Database connection pooling included

## 🔍 Troubleshooting

### Common Issues

1. **Database Connection Failed**

   ```bash
   docker compose up -d
   # Wait for health checks to pass
   ```

2. **Redis Connection Failed**

   ```bash
   docker compose logs redis
   # Check Redis container status
   ```

3. **Tests Failing**

   ```bash
   npm install
   npm test -- --reporter=verbose
   ```

4. **Worker Not Processing Events**
   - Check debounce settings
   - Verify mock listings are seeded
   - Review log output for errors

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

## 📝 API Reference

### Core Functions

- `enrichOne(listingId, deps)`: Process single listing enrichment
- `EnrichmentScheduler.start()`: Begin event processing
- `Debouncer.shouldProcess()`: Check debounce logic

### Repository Methods

- `getByListingId(id)`: Fetch existing enrichment
- `upsert(enrichment)`: Save with change detection
- `getStats()`: Admin metrics

### Cache Methods

- `get<T>(key)`: Retrieve cached value
- `set(key, value, ttlSec)`: Store with expiration
- `keys(pattern)`: Find keys by pattern

## 🤝 Contributing

1. Run tests: `npm test`
2. Check linting: `npm run lint`
3. Ensure Docker setup works: `docker compose up -d`
4. Test with real data when possible

## 📄 License

MIT License - see LICENSE file for details.
