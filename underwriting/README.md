# Underwriting Service

Investment metrics computation service for real estate listings using rent/expense inputs and user assumptions.

## Mission

Compute investment metrics for listings using rent/expense inputs and user (or default) assumptions. Produces two kinds of results:

1. **Shared Grid** - Binned assumptions, cross-user reusable
2. **Exact Cache** - Arbitrary assumptions, per-request but memoized

Publishes `underwrite_completed` when a listing's result changes materially so Alerts can fire.

## Key Metrics

- **NOI** - Net Operating Income
- **Cap Rate** - Capitalization Rate (NOI / Price)
- **DS** - Debt Service (Annual)
- **Cash Flow** - Annual Cash Flow (NOI - DS)
- **CoC** - Cash-on-Cash Return
- **DSCR** - Debt Service Coverage Ratio
- **Breakeven** - Breakeven Occupancy
- **IRR** - Internal Rate of Return (optional)

## Architecture

### Core Components

- **Finance** - Mortgage calculations and metrics computation
- **Grid** - Vectorized computation for binned assumption sets
- **Exact** - On-demand computation with caching
- **Handlers** - Event processing for `underwrite_requested` and `listing_changed`

### Data Flow

```
Listings + Enrichment + Rent Estimates
           ↓
    Base Inputs (Snapshot)
           ↓
    Grid/Exact Computation
           ↓
     Cached Results
           ↓
  underwrite_completed Event
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 16+
- Redis 7+

### Development Setup

1. **Clone and install dependencies**

   ```bash
   cd underwriting
   npm install
   ```

2. **Start infrastructure**

   ```bash
   docker compose up -d
   ```

3. **Run tests**

   ```bash
   npm test
   ```

4. **Start worker**

   ```bash
   npm run dev:worker
   ```

5. **Start API (optional)**
   ```bash
   npm run dev:api
   ```

### Environment Configuration

Copy `.env.example` to `.env` and adjust settings:

```bash
cp .env.example .env
```

Key configuration options:

- **Database**: Connection settings for PostgreSQL
- **Redis**: URL for event bus and caching
- **Grid**: Bin ranges and steps for grid computation

## Usage

### Event-Driven Processing

The service responds to two main events:

#### 1. Underwrite Requested

```json
{
  "type": "underwrite_requested",
  "id": "listing-123",
  "assumptionsId": "user-assumptions-456" // optional
}
```

- **Without assumptionsId**: Computes full grid with default assumptions
- **With assumptionsId**: Computes exact metrics with user assumptions

#### 2. Listing Changed

```json
{
  "type": "listing_changed",
  "id": "listing-123",
  "change": "update",
  "dirty": ["price", "fees", "tax"]
}
```

Automatically recomputes grid when financial data changes.

### HTTP API (Optional)

#### Health Check

```bash
GET /health
```

#### Exact Computation

```bash
POST /underwrite
Content-Type: application/json

{
  "listingId": "listing-123",
  "assumptions": {
    "downPct": 0.25,
    "rateBps": 475,
    "amortMonths": 300,
    "rentScenario": "P75"
  }
}
```

#### Grid Lookup

```bash
GET /grid?listingId=listing-123&listingVersion=1&rentScenario=P50&downPct=0.20&rateBps=500&amortMonths=360
```

## Database Schema

The service uses PostgreSQL with the following main tables:

- `mortgage_factors` - Precomputed annuity factors
- `listing_base` - Materialized base inputs (optional)
- `underwrite_grid` - Shared grid computations
- `underwrite_exact` - Exact cache entries
- `user_assumptions` - Custom assumption sets

## Grid Configuration

Default grid bins:

- **Down Payment**: 5% to 35% in 1% steps
- **Interest Rate**: 300 to 800 bps in 5 bps steps
- **Amortization**: 240, 300, 360 months
- **Rent Scenarios**: P25, P50, P75

This generates approximately 28,000+ combinations per listing.

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test finance
npm test grid
npm test exact

# Run tests in watch mode
npm run test:watch
```

## Scripts

- `npm run dev:worker` - Start worker in development
- `npm run dev:api` - Start API server in development
- `npm run build` - Compile TypeScript
- `npm run start:worker` - Start compiled worker
- `npm run start:api` - Start compiled API server
- `npm test` - Run test suite
- `npm run lint` - Run ESLint

## Performance Notes

### Optimization Strategies

1. **Precomputed Factors** - Annuity factors cached in database
2. **Vectorized Grid** - Bulk computation and upsert
3. **Smart Caching** - Version-aware exact cache
4. **Efficient Queries** - Optimized database indexes

### Monitoring

The worker logs key metrics:

- Grid computation counts and timing
- Cache hit rates
- Memory usage and uptime
- Event processing rates

## Integration

### With Other Services

- **Ingestor** - Receives `listing_changed` events
- **Enrichment** - Uses enrichment data for closing costs and expenses
- **Rent Estimator** - Uses rent estimates for NOI calculation
- **Alerts** - Receives `underwrite_completed` events

### Event Bus

Uses Redis pub/sub for event communication. Topics:

- `underwrite_requested` - Incoming computation requests
- `listing_changed` - Listing update notifications
- `underwrite_completed` - Computation completion notifications

## Deployment

### Production Build

```bash
npm run build
docker build -t underwriting-service .
```

### Environment Variables

Required for production:

```bash
NODE_ENV=production
DB_HOST=prod-postgres-host
DB_PASSWORD=secure-password
REDIS_URL=redis://prod-redis-host:6379
```

## Troubleshooting

### Common Issues

1. **Database Connection Failures**

   - Check PostgreSQL is running and accessible
   - Verify connection credentials in `.env`

2. **Redis Connection Issues**

   - Ensure Redis is running on specified port
   - Check `REDIS_URL` configuration

3. **Grid Computation Timeouts**

   - Reduce grid bin ranges in configuration
   - Check database performance and indexes

4. **Memory Issues**
   - Monitor heap usage in worker logs
   - Consider reducing concurrent computations

### Debugging

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev:worker
```

## Contributing

1. Follow TypeScript strict mode
2. Add tests for new features
3. Update documentation for API changes
4. Use conventional commit messages

## License

ISC
