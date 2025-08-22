# Integration Guide: API Gateway + Demo Web App

This document explains how the API Gateway integrates with the demo web application and the complete microservices pipeline.

## 🔄 Data Flow Architecture

```
┌─────────────────┐    HTTP/SSE     ┌──────────────────┐
│   Demo Web App  │◄──────────────► │   API Gateway    │
│  (React/Vite)   │                 │      (BFF)       │
│ localhost:3000  │                 │  localhost:8080  │
└─────────────────┘                 └─────────┬────────┘
                                              │
                           ┌──────────────────┼──────────────────┐
                           │                  │                  │
                  Reads from Service Databases:                  │
                           │                  │                  │
        ┌──────────────────▼─┐  ┌─────────────▼─┐  ┌─────────────▼─┐
        │  Ingestor DB       │  │ Enrichment DB  │  │Underwriting DB│
        │   (listings)       │  │ (enrichments)  │  │  (metrics)    │
        │ localhost:5432     │  │ localhost:5432 │  │ localhost:5432│
        └────────────────────┘  └────────────────┘  └───────────────┘
                    ▲                      ▲                      ▲
                    │                      │                      │
            ┌───────┴───────┐    ┌────────┴────────┐    ┌───────┴───────┐
            │   Ingestor    │    │   Enrichment    │    │ Underwriting  │
            │   Service     │    │    Service      │    │   Service     │
            └───────────────┘    └─────────────────┘    └───────────────┘
                    ▲                      ▲                      ▲
                    └──────────────────────┼──────────────────────┘
                                           │
                               ┌───────────▼───────────┐
                               │     Redis Bus         │
                               │  (Event Streaming)    │
                               │   localhost:6379      │
                               └───────────────────────┘
```

## 🚀 Quick Start

### Complete Pipeline Demo

```bash
# Run the complete setup (recommended)
npm run setup:demo

# This will:
# ✅ Start all databases and Redis
# ✅ Run migrations for all services
# ✅ Seed ingestor with mock data
# ✅ Start all microservices
# ✅ Start the API Gateway
# ✅ Process data through the entire pipeline

# Then start the web app (in another terminal)
npm run dev:demo

# Visit: http://localhost:3000
```

### Development Mode

```bash
# Option 1: Full pipeline
npm run setup:demo
# In another terminal:
npm run dev:demo

# Option 2: API Gateway + Demo only
npm run docker:up
npm run dev:api-gateway
# In another terminal:
npm run dev:demo

# Option 3: Mock data only (no microservices)
cd demo-web
npm run dev:with-mock
```

## 🔌 Integration Points

### 1. HTTP API Integration

The demo web app makes requests to the API Gateway at `http://localhost:8080/api/v1`:

```typescript
// Demo Web App API Service
export class APIService {
  private baseURL = "/api/v1"; // Proxied to API Gateway

  async getListings(): Promise<APIResponse<Listing[]>> {
    return this.request<PropertySearchResponse>("/properties");
  }

  async getPropertyDetail(
    id: string
  ): Promise<APIResponse<PropertyDetailResponse>> {
    return this.request<PropertyDetailResponse>(`/properties/${id}`);
  }
}
```

### 2. API Gateway Data Composition

The API Gateway reads from multiple service databases and composes responses:

```typescript
// API Gateway Orchestration
export class OrchestrationService {
  async getPropertyDetail(listingId: string): Promise<PropertyDetailResponse> {
    // Parallel requests to service databases
    const [listing, enrichment, underwriting, alerts] = await Promise.all([
      this.listingsAdapter.findById(listingId), // → Ingestor DB
      this.enrichmentAdapter.findByListingId(listingId), // → Enrichment DB
      this.underwritingAdapter.findByListingId(listingId), // → Underwriting DB
      this.alertsAdapter.findByUserId(userId), // → Alerts DB
    ]);

    return { listing, enrichment, underwriting, alerts };
  }
}
```

### 3. Database Connection Strategy

Each adapter connects to its service's database:

```typescript
// config/env.ts
export const serviceDatabases = {
  ingestor: { host: "localhost", port: 5432, database: "ingestor" },
  enrichment: { host: "localhost", port: 5432, database: "enrichment" },
  underwriting: { host: "localhost", port: 5432, database: "underwriting" },
  // ... etc
};

// adapters/listings.read.ts
export class ListingsReadAdapter {
  constructor() {
    this.db = new Pool(serviceDatabases.ingestor); // Dedicated connection
  }
}
```

### 4. Real-time Events (Server-Sent Events)

```typescript
// Demo Web App
subscribeToEvents(eventType: string, callback: (data: any) => void) {
  // Connect to API Gateway SSE endpoint
  this.eventSource = new EventSource("/sse/events");

  this.eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    callback(data); // Handle real-time updates
  };
}
```

## 📊 Data Transformation Flow

### 1. Raw MLS Data (Ingestor)

```json
{
  "MlsNumber": "C5123456",
  "Status": "A",
  "Address": { "StreetNumber": "123", "StreetName": "Main St" },
  "PropertyType": "Condo Apartment",
  "ListPrice": 750000
}
```

### 2. Enhanced Data (Enrichment)

```json
{
  "listingId": "listing-C5123456",
  "geo": { "lat": 43.6426, "lng": -79.3871, "fsa": "M5V" },
  "taxes": { "annualEstimate": 4200, "method": "exact" },
  "rentPriors": { "p25": 2800, "p50": 3200, "p75": 3800 }
}
```

### 3. Investment Analysis (Underwriting)

```json
{
  "listingId": "listing-C5123456",
  "metrics": {
    "noi": 33600,
    "capRate": 0.0395,
    "cashFlow": 850,
    "coc": 0.065,
    "dscr": 1.25
  }
}
```

### 4. Composed API Response (API Gateway)

```json
{
  "success": true,
  "data": {
    "listing": {
      /* transformed listing data */
    },
    "enrichment": {
      /* geo, tax, location data */
    },
    "underwriting": [
      {
        /* investment metrics */
      }
    ],
    "alerts": [
      {
        /* user-specific alerts */
      }
    ]
  }
}
```

## 🏗️ Service Communication

### Event-Driven Pipeline

```
Ingestor → listings.changed → Enrichment
                           ↘
Enrichment → underwrite.requested → Underwriting
                                 ↘
Underwriting → underwrite.completed → Alerts
```

### API Gateway Read Pattern

```
API Gateway → Direct DB reads from all service databases
           → Synchronous HTTP calls to Underwriting service for on-demand calculations
           → Event subscription for real-time updates
```

## 🔧 Configuration

### Environment Variables

```bash
# API Gateway connects to multiple service databases
INGESTOR_DB_NAME=ingestor
ENRICHMENT_DB_NAME=enrichment
UNDERWRITING_DB_NAME=underwriting
ALERTS_DB_NAME=alerts

# All services share the same PostgreSQL instance (different databases)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password

# Shared Redis for events
REDIS_URL=redis://localhost:6379
```

### Vite Proxy Configuration (Demo Web App)

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080", // API Gateway
        changeOrigin: true,
      },
      "/sse": {
        target: "http://localhost:8080", // API Gateway SSE
        changeOrigin: true,
      },
    },
  },
});
```

## 🧪 Testing the Integration

### 1. Verify API Gateway Health

```bash
curl http://localhost:8080/health
```

### 2. Test Property Search

```bash
curl http://localhost:8080/api/v1/properties
```

### 3. Test Property Detail with Full Analysis

```bash
curl http://localhost:8080/api/v1/properties/listing-C5123456
```

### 4. Test System Status

```bash
curl http://localhost:8080/api/v1/system/status
```

### 5. Verify Data in Service Databases

```bash
# Check ingestor
psql -d ingestor -c "SELECT COUNT(*) FROM listings;"

# Check enrichment
psql -d enrichment -c "SELECT COUNT(*) FROM enrichments;"

# Check underwriting
psql -d underwriting -c "SELECT COUNT(*) FROM underwrite_grid;"
```

## 🚨 Troubleshooting

### API Gateway Can't Connect to Service Databases

```bash
# Check if databases exist
psql -l | grep -E "(ingestor|enrichment|underwriting)"

# Run migrations if databases are empty
npm run setup:demo
```

### Demo Web App Shows No Data

```bash
# Check API Gateway logs
npm run dev:api-gateway

# Verify API Gateway can read from databases
curl http://localhost:8080/api/v1/properties
```

### Services Not Processing Events

```bash
# Check Redis is running
redis-cli ping

# Check service logs
npm run dev:all
```

## 🎯 Key Benefits of This Integration

1. **Production-Like Architecture** - Real microservices with event-driven communication
2. **Data Sovereignty** - Each service owns its data
3. **API Gateway Pattern** - Single entry point for UI with data composition
4. **Real-time Updates** - Live data flow through SSE
5. **Scalable Design** - Each component can scale independently
6. **Development Flexibility** - Can run individual services or full pipeline

This integration showcases a **true microservices architecture** rather than a monolithic application, demonstrating proper service boundaries, event-driven communication, and API Gateway patterns used in production systems.
