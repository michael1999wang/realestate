# API Gateway / Backend-for-Frontend (BFF)

A production-ready API Gateway that exposes a single HTTP API for the real estate web dashboard and external clients. The gateway orchestrates data from multiple microservices without containing business logic itself.

## 🎯 Purpose

The API Gateway serves as a **Backend-for-Frontend (BFF)** that:

- **Composes data** from multiple microservices for UI consumption
- **Validates inputs** and enforces authentication/authorization
- **Manages subscription tiers** and rate limiting
- **Provides caching** for frequently accessed data
- **Handles cross-cutting concerns** (auth, logging, monitoring)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                 API Gateway                         │
├─────────────────────────────────────────────────────┤
│ • HTTP API Endpoints                                │
│ • Request Validation                                │
│ • Authentication & Authorization                    │
│ • Rate Limiting & Caching                          │
│ • Data Composition & Orchestration                 │
└─────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│   Ingestor     │ │   Enrichment    │ │  Underwriting   │
│   (Read DB)    │ │   (Read DB)     │ │  (Read DB +     │
│                │ │                 │ │   HTTP API)     │
└────────────────┘ └─────────────────┘ └─────────────────┘
```

### Key Principles

1. **No Business Logic**: Gateway only orchestrates and validates
2. **Read-Only Access**: Reads from service datastores, no cross-service writes
3. **Synchronous Composition**: Aggregates data for UI needs
4. **Service Independence**: Services own their data completely

## 🔌 API Endpoints

### Public Endpoints

| Method | Endpoint                 | Description       | Auth Required |
| ------ | ------------------------ | ----------------- | ------------- |
| `GET`  | `/health`                | Health check      | ❌            |
| `GET`  | `/api/v1/properties`     | Search properties | Optional      |
| `GET`  | `/api/v1/properties/:id` | Property details  | Optional      |
| `GET`  | `/api/v1/system/status`  | System status     | Optional      |

### Authenticated Endpoints

| Method   | Endpoint                              | Description              | Required Tier |
| -------- | ------------------------------------- | ------------------------ | ------------- |
| `POST`   | `/api/v1/underwrite`                  | Trigger underwriting     | Pro+          |
| `GET`    | `/api/v1/properties/:id/underwriting` | Get underwriting results | Pro+          |
| `POST`   | `/api/v1/properties/batch`            | Batch property details   | Pro+          |
| `GET`    | `/api/v1/searches`                    | User's saved searches    | Free+         |
| `POST`   | `/api/v1/searches`                    | Create saved search      | Free+         |
| `PUT`    | `/api/v1/searches/:id`                | Update saved search      | Free+         |
| `DELETE` | `/api/v1/searches/:id`                | Delete saved search      | Free+         |
| `GET`    | `/api/v1/alerts`                      | User's alerts            | Free+         |
| `POST`   | `/api/v1/alerts/:id/read`             | Mark alert as read       | Free+         |
| `GET`    | `/api/v1/user/profile`                | Current user profile     | Free+         |

## 🔄 Service Dependencies

### Read Adapters (Data Composition)

- **Ingestor Service**: Property listings data
- **Enrichment Service**: Geo, tax, fee, and location data
- **Rent Estimator Service**: Rental market estimates
- **Underwriting Service**: Investment metrics (read from DB)
- **Alerts Service**: User notifications and saved searches

### Service Clients (Synchronous Calls)

- **Underwriting Service**: On-demand calculations via HTTP API

### External Dependencies

- **PostgreSQL**: User management, API keys, caching some composed data
- **Redis**: Caching, rate limiting, session storage

## 🚀 Quick Start

### Development Mode

```bash
# Install dependencies
cd api-gateway
npm install

# Set environment variables
export NODE_ENV=development
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=api_gateway
export REDIS_HOST=localhost
export ENABLE_AUTH=false    # Disable auth for dev
export ENABLE_RATE_LIMIT=false

# Start the API server
npm run dev:api

# Or start the background worker
npm run dev:worker

# Or both (if using BaseService pattern)
npm run dev
```

### Production Mode

```bash
# Set production environment variables
export NODE_ENV=production
export DB_HOST=postgres.internal
export DB_PASSWORD=your_secure_password
export REDIS_HOST=redis.internal
export JWT_SECRET=your_super_secret_jwt_key
export ENABLE_AUTH=true
export ENABLE_RATE_LIMIT=true
export ENABLE_CACHE=true

# Build and start
npm run build
npm run start:api
```

## 🔧 Configuration

### Environment Variables

| Variable            | Default           | Description           |
| ------------------- | ----------------- | --------------------- |
| `NODE_ENV`          | `development`     | Environment mode      |
| `PORT`              | `8080`            | HTTP server port      |
| `DB_HOST`           | `localhost`       | PostgreSQL host       |
| `DB_PORT`           | `5432`            | PostgreSQL port       |
| `DB_NAME`           | `api_gateway`     | Database name         |
| `DB_USER`           | `postgres`        | Database user         |
| `DB_PASSWORD`       | `password`        | Database password     |
| `REDIS_HOST`        | `localhost`       | Redis host            |
| `REDIS_PORT`        | `6379`            | Redis port            |
| `JWT_SECRET`        | ⚠️ Change in prod | JWT signing secret    |
| `ENABLE_AUTH`       | `true`            | Enable authentication |
| `ENABLE_RATE_LIMIT` | `true`            | Enable rate limiting  |
| `ENABLE_CACHE`      | `true`            | Enable caching        |

### Subscription Tiers & Rate Limits

| Tier           | Requests/Hour | Features                                |
| -------------- | ------------- | --------------------------------------- |
| **Free**       | 100           | Basic property search, saved searches   |
| **Pro**        | 1,000         | + Underwriting, batch requests, alerts  |
| **Enterprise** | 10,000        | + Priority support, custom integrations |

### Cache TTL Settings

| Data Type            | TTL    | Reason                                  |
| -------------------- | ------ | --------------------------------------- |
| Property Search      | 5 min  | Search results change frequently        |
| Property Details     | 10 min | Individual properties update less often |
| Enrichment Data      | 1 hour | Enrichment data is relatively stable    |
| Underwriting Results | 30 min | Calculations are expensive              |
| Health Checks        | 1 min  | Need fresh health status                |

## 🔐 Authentication & Authorization

### Development Mode

When `ENABLE_AUTH=false`:

- All requests use a demo user with `pro` tier
- No token validation performed
- Useful for development and testing

### Production Mode

When `ENABLE_AUTH=true`:

**JWT Bearer Tokens**:

```bash
curl -H "Authorization: Bearer <jwt_token>" \
  http://localhost:8080/api/v1/properties
```

**API Keys** (for programmatic access):

```bash
curl -H "X-API-Key: <api_key>" \
  http://localhost:8080/api/v1/properties
```

**Login Endpoint**:

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -d '{"email":"user@example.com","password":"password"}'
```

## 📊 Monitoring & Health Checks

### Health Endpoints

- `GET /health` - Basic health check
- `GET /api/v1/system/status` - Detailed system status with upstream services

### Metrics Collection

The gateway automatically collects metrics on:

- HTTP request rates and response times
- Authentication success/failure rates
- Rate limit violations
- Cache hit/miss rates
- Upstream service health
- Database and Redis connectivity

## 🏃‍♂️ Data Flow Examples

### Property Search Flow

```
1. GET /api/v1/properties?city=Toronto&propertyType=Condo
   └── Check cache (key: search:<hash>)
   └── Query Ingestor service DB
   └── Cache results (5 min TTL)
   └── Return PropertySearchResponse
```

### Property Detail Flow

```
1. GET /api/v1/properties/123e4567-e89b-12d3-a456-426614174000
   └── Check cache (key: property_detail:listing_id)
   └── Parallel queries:
       ├── Ingestor DB: Listing data
       ├── Enrichment DB: Geo, taxes, fees, scores
       ├── Rent Estimator DB: Rent estimates
       ├── Underwriting DB: Investment metrics
       └── Alerts DB: User-specific alerts
   └── Compose PropertyDetailResponse
   └── Cache result (10 min TTL)
```

### On-Demand Underwriting Flow

```
1. POST /api/v1/underwrite
   └── Validate user tier (Pro+)
   └── Validate listing exists
   └── Check cache (key: underwriting:listing:assumptions)
   └── HTTP call to Underwriting service
   └── Cache result (30 min TTL)
   └── Return UnderwriteResponse
```

## 🔧 Development

### Adding New Endpoints

1. **Define DTOs** in `src/core/dto.ts`
2. **Add validation schema** in `src/http/middleware.ts`
3. **Create route handler** in `src/http/routes.ts`
4. **Add orchestration logic** in `src/core/orchestration.ts`
5. **Update documentation**

### Adding New Service Integrations

1. **Create read adapter** in `src/adapters/`
2. **Define port interface** in `src/core/ports.ts`
3. **Inject adapter** in `src/service-config.ts`
4. **Add to orchestration service**

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint
```

## 🚨 Important Notes

### What This Service Does NOT Do

- ❌ **Contains business logic** - Only orchestrates and validates
- ❌ **Writes to other service databases** - Read-only access
- ❌ **Processes domain events** - Focuses on HTTP API
- ❌ **Duplicates service functionality** - Thin composition layer

### Production Considerations

- **Load Balancing**: Gateway can scale horizontally
- **Circuit Breakers**: Implement for upstream service failures
- **Request Tracing**: Add correlation IDs for debugging
- **Security**: Regular security audits, input validation
- **Monitoring**: Comprehensive observability setup

## 📚 Related Documentation

- [Service Architecture Overview](../ARCHITECTURE.md)
- [Ingestor Service](../ingestor/README.md)
- [Enrichment Service](../enrichment/README.md)
- [Underwriting Service](../underwriting/README.md)
- [Alerts Service](../alerts/README.md)
