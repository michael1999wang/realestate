# Real Estate Demo Web Application

A React-based web application that demonstrates the complete real estate microservices pipeline through an intuitive dashboard interface.

## 🎯 What This Demo Shows

This demo showcases the **end-to-end data flow** through the microservices architecture:

1. **Ingestor** - Ingests property listings from MLS data feeds
2. **Enrichment** - Adds geo-location, tax data, and market insights
3. **Rent Estimator** - Calculates rental income estimates
4. **Underwriting** - Performs investment analysis and metrics
5. **Alerts** - Matches properties against user criteria
6. **API Gateway** - Composes data for the web interface

## 🚀 Quick Start (Integrated Pipeline)

### Option 1: Complete Demo Setup (Recommended)

This sets up the **entire pipeline** with real data flow:

```bash
# From the project root
npm run setup:demo
```

This command will:

- ✅ Start all databases and Redis with Docker
- ✅ Run database migrations for all services
- ✅ Seed the ingestor with mock data
- ✅ Start all microservices
- ✅ Trigger the data pipeline to flow data through all services
- ✅ Start the API Gateway
- ✅ Verify data flow

Then start the web app:

```bash
npm run dev:demo
```

Visit: **http://localhost:3000**

### Option 2: Demo Web App Only (Mock Data)

If you want to run just the web interface with mock data:

```bash
cd demo-web
npm run dev:with-mock  # Starts both mock server and web app
```

Visit: **http://localhost:3000**

## 📊 Demo Features

### Real-Time Listings Feed

- Live property listings flowing through the pipeline
- Property cards with key metrics
- Real-time updates via Server-Sent Events

### Enrichment Pipeline Visualization

- Shows data enhancement stages
- Geo-coding, tax assessment, location scoring
- Market rent estimates and comparable analysis

### Investment Analysis Dashboard

- Comprehensive underwriting metrics
- Cap rates, cash flow, debt coverage ratios
- Scenario analysis with different assumptions

### Saved Searches & Alerts

- Custom search criteria management
- Investment threshold configuration
- Real-time notifications when matches are found

### Live Alerts

- Property alerts based on investment criteria
- Real-time notifications
- Alert management and dismissal

### System Monitor

- Live system health monitoring
- Service status and performance metrics
- Event processing statistics

## 🏗️ Architecture Integration

The demo web app integrates with the **complete microservices pipeline**:

```
┌─────────────────────────────────────────────────────┐
│                 Demo Web App                        │
│               (React Frontend)                      │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP Requests
┌─────────────────────────────────────────────────────┐
│                API Gateway                          │
│          (Backend-for-Frontend)                     │
└──────────────────┬──────────────────────────────────┘
                   │ Reads from Multiple DBs
        ┌──────────┼──────────┬──────────┬──────────┐
        │          │          │          │          │
   ┌────▼───┐ ┌───▼───┐ ┌────▼───┐ ┌────▼───┐ ┌───▼───┐
   │Ingestor│ │Enrich │ │ Rent   │ │Under-  │ │Alerts │
   │   DB   │ │  DB   │ │Est. DB │ │writing │ │  DB   │
   │        │ │       │ │        │ │   DB   │ │       │
   └────────┘ └───────┘ └────────┘ └────────┘ └───────┘
```

## 🔧 Development Mode Options

### Full Pipeline Development

```bash
# Start all services and databases
npm run setup:demo

# In another terminal, start the web app
npm run dev:demo
```

### Frontend-Only Development

```bash
# Start just the web app with mock data
cd demo-web
npm run dev:with-mock
```

### API Gateway Development

```bash
# Start just API Gateway + databases
npm run docker:up
npm run dev:api-gateway

# Start web app pointing to API Gateway
npm run dev:demo
```

## 🌐 API Integration

The demo web app makes HTTP requests to the API Gateway at:

- **API Base URL**: `http://localhost:8080/api/v1`
- **Health Check**: `http://localhost:8080/health`
- **System Status**: `http://localhost:8080/api/v1/system/status`

### Key Endpoints Used:

- `GET /api/v1/properties` - Property search
- `GET /api/v1/properties/:id` - Property details with full analysis
- `POST /api/v1/underwrite` - Trigger investment calculation
- `GET /api/v1/searches` - Saved searches management
- `GET /api/v1/alerts` - User alerts and notifications

## 📱 Demo Scenarios

### Property Investment Flow

1. **Browse Properties** - See listings in the feed
2. **View Analysis** - Click a property to see full investment metrics
3. **Create Criteria** - Set up saved searches with investment thresholds
4. **Receive Alerts** - Get notified when properties match your criteria
5. **Monitor System** - Watch the pipeline process data in real-time

### Pipeline Demonstration

1. **Data Ingestion** - New listings appear in the feed
2. **Enrichment** - Watch properties get enhanced with location data
3. **Rent Analysis** - See rental estimates calculated
4. **Underwriting** - View investment metrics computed
5. **Alert Generation** - Properties trigger user alerts

## 🔍 What Makes This Special

Unlike typical demos with static data, this showcases:

✨ **Real Event-Driven Architecture** - Data flows through actual microservices
✨ **Asynchronous Processing** - See data transformation in real-time
✨ **Service Independence** - Each service owns its data and responsibilities  
✨ **Production-Like Flow** - Mirrors how the system works in production
✨ **API Gateway Pattern** - Demonstrates proper BFF (Backend-for-Frontend) usage

## 🛠️ Troubleshooting

### Services Won't Start

```bash
# Check Docker services
docker ps

# Restart Docker services
npm run docker:down && npm run docker:up
```

### No Data Appearing

```bash
# Trigger the pipeline manually
npm run setup:demo
```

### API Gateway Connection Issues

Check that the API Gateway is running on port 8080:

```bash
curl http://localhost:8080/health
```

### Web App Not Loading

Make sure you're running the correct command:

```bash
# For full pipeline demo
npm run dev:demo

# For mock data demo
cd demo-web && npm run dev:with-mock
```

## 📚 Related Documentation

- [API Gateway Documentation](../api-gateway/README.md)
- [System Architecture](../ARCHITECTURE.md)
- [Service Documentation](../services.md)
