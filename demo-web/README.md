# Real Estate Investment Platform - Demo GUI

A comprehensive web application that demonstrates the real estate microservices ecosystem, showcasing the complete flow from listing ingestion to investment analysis and alerts.

## Features

### 🏠 Real-time Listings Feed

- Live property data from TREB/CREA sources
- Advanced filtering and search capabilities
- Property details with photos and specifications

### 🔄 Enrichment Pipeline Visualization

- Step-by-step data enhancement process
- Geocoding, tax estimation, and location scoring
- Real-time progress tracking

### 💰 Investment Analysis Dashboard

- Comprehensive underwriting metrics (NOI, DSCR, CoC, Cap Rate)
- Scenario analysis with different rent projections
- Interactive charts and financial breakdowns

### 🔍 Saved Searches & Alerts

- Custom investment criteria management
- Multi-channel notification system
- Real-time alert monitoring

### 📊 System Status Monitor

- Microservices health monitoring
- Performance metrics and error tracking
- Real-time system status updates

## Architecture

The demo showcases a complete microservices ecosystem:

- **Ingestor Service**: Polls and normalizes MLS data
- **Enrichment Service**: Adds location scores, taxes, and market data
- **Rent Estimator**: Calculates market rent using comparables
- **Underwriting Service**: Computes investment metrics
- **Alerts Service**: Matches properties to user criteria

All services communicate via Redis event bus with real-time updates.

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the demo:**

   ```bash
   npm run dev
   ```

3. **Access the application:**
   - Open [http://localhost:3000](http://localhost:3000)
   - The API mock server runs on port 8080

### Available Scripts

- `npm run dev` - Start both client and server in development mode
- `npm run dev:client` - Start only the React frontend
- `npm run dev:server` - Start only the API mock server
- `npm run build` - Build for production
- `npm run preview` - Preview the production build

## Demo Data

The application includes realistic mock data for:

- **4 Sample Properties** across Toronto, Vancouver, and Calgary
- **Enrichment Data** with location scores, taxes, and rent estimates
- **Investment Analysis** with multiple scenarios and metrics
- **Saved Searches** with different investment criteria
- **Real-time Alerts** demonstrating the notification system

## Key Demonstration Flows

### 1. Listing to Analysis Flow

1. Browse the **Listings Feed** to see incoming properties
2. View the **Enrichment Pipeline** to see data enhancement
3. Analyze investment metrics in **Investment Analysis**
4. Set up alerts in **Saved Searches**

### 2. Real-time Monitoring

1. Enable real-time updates in **Live Alerts**
2. Monitor system health in **System Monitor**
3. Watch new listings appear automatically
4. Receive investment match notifications

### 3. Investment Criteria Setup

1. Create saved searches with specific criteria
2. Set financial thresholds (DSCR, CoC, Cap Rate)
3. Configure notification channels
4. Monitor matching properties in real-time

## Technical Features

### Real-time Updates

- Server-Sent Events (SSE) simulation
- Live property feed updates
- Real-time alert notifications
- System health monitoring

### Responsive Design

- Mobile-friendly interface
- Modern UI with Tailwind CSS
- Interactive charts with Recharts
- Accessible components

### Data Visualization

- Investment metric charts
- Scenario comparison graphs
- System performance monitoring
- Pipeline progress tracking

## Mock API Endpoints

The demo includes a complete mock API that simulates:

- `/api/listings` - Property listings management
- `/api/enrichments` - Data enrichment results
- `/api/underwriting` - Investment analysis
- `/api/searches` - Saved search management
- `/api/alerts` - Alert notifications
- `/api/system` - System health monitoring

## Customization

### Adding New Data

Modify `src/data/mockData.ts` to add:

- New property listings
- Additional enrichment data
- Custom investment scenarios
- System health metrics

### Extending Features

The codebase is structured for easy extension:

- Add new pages in `src/pages/`
- Create reusable components in `src/components/`
- Extend API services in `src/services/`
- Add new data types in `src/types/`

## Integration with Real Services

To connect with actual microservices:

1. Update `src/services/api.ts` to use real endpoints
2. Replace mock data with actual API calls
3. Configure real-time event sources (WebSocket/SSE)
4. Update authentication and authorization

## Technologies Used

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Routing**: React Router 6
- **Charts**: Recharts
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Date Handling**: date-fns

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Performance

The demo is optimized for:

- Fast initial load times
- Smooth real-time updates
- Responsive user interactions
- Efficient data visualization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
