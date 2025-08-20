# Alerts Service

Real-time property alerts service that listens to upstream events (underwrite_completed, property_scored) and matches them against user saved searches to dispatch notifications.

## Features

- **Real-time Event Processing**: Listens to Redis Streams for property events
- **Flexible Matching**: Supports property filters (city, type, price, beds) and financial thresholds (DSCR, CoC, Cap Rate, Cash Flow)
- **Multi-channel Dispatch**: DevBrowser (SSE), Email, SMS, Slack, Webhook (stubs for prod channels)
- **Dev-friendly**: Live alert board via Server-Sent Events for development

## Quick Start

### Development Mode

```bash
# Install dependencies
npm install

# Start services (Redis + Postgres + Alerts)
docker-compose up -d

# View live alerts
open http://localhost:8082
```

### Test Alert

```bash
# Send test alert via HTTP
curl -X POST http://localhost:8082/alerts/test \
  -H "Content-Type: application/json" \
  -d '{"message": "test alert"}'
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis Stream  │───▶│  Alerts Worker  │───▶│   Dispatcher    │
│                 │    │                 │    │                 │
│ underwrite_     │    │ • Match Rules   │    │ • DevBrowser    │
│ completed       │    │ • Filter Props  │    │ • Email (stub)  │
│                 │    │ • Check Thresh  │    │ • SMS (stub)    │
│ property_scored │    │                 │    │ • Slack (stub)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   Postgres      │
                       │                 │
                       │ • SavedSearches │
                       │ • Alerts        │
                       └─────────────────┘
```

## Event Types

### UnderwriteCompletedEvt

```typescript
{
  id: string;          // listingId
  resultId: string;    // underwrite result ID
  score?: number;      // optional overall score
  source: "grid" | "exact";
  type: "underwrite_completed";
  ts?: string;
}
```

### PropertyScoredEvt

```typescript
{
  id: string;          // listingId
  score: number;       // property score
  type: "property_scored";
  ts?: string;
}
```

## Saved Search Structure

```typescript
{
  id: string;
  userId: string;
  name: string;
  filter: {
    city?: string;
    province?: string;
    propertyType?: string;
    minBeds?: number;
    maxPrice?: number;
  };
  thresholds: {
    minDSCR?: number;
    minCoC?: number;           // 0.06 = 6%
    minCapRate?: number;
    minScore?: number;
    requireNonNegativeCF?: boolean;
  };
  notify: {
    channel: ("devbrowser"|"email"|"sms"|"slack"|"webhook")[];
  };
  isActive: boolean;
}
```

## Scripts

- `npm run dev` - Start worker in development mode
- `npm run dev:http` - Start HTTP server only
- `npm run test` - Run unit tests
- `npm run build` - Build for production
- `npm start` - Start production worker

## Environment Variables

```bash
MODE=dev                    # dev or prod
PORT=8082                  # HTTP server port
REDIS_URL=redis://localhost:6379
DB_HOST=localhost
DB_PORT=5437
DB_USER=alerts
DB_PASSWORD=alerts
DB_NAME=alerts_dev
```

## Database Schema

### saved_searches

- Stores user search criteria and notification preferences
- Indexed on city, province, propertyType, maxPrice, minBeds for fast filtering

### alerts

- Stores triggered alerts with full payload
- Tracks delivery status per channel

## Testing

```bash
# Run all tests
npm test

# Run specific test
npm test rules.test.ts

# Watch mode
npm run test:watch
```

## Integration

The service integrates with:

- **Underwriting Service**: Receives underwrite_completed events
- **Property Scoring**: Receives property_scored events
- **User Management**: Uses userId for search ownership
- **Notification Channels**: Dispatches via multiple channels

## Production Considerations

- Email/SMS/Slack senders need real implementations
- Add rate limiting and quotas
- Implement delivery retries and DLQ
- Add webhook signing for security
- Consider debouncing duplicate alerts
- Add monitoring and alerting
