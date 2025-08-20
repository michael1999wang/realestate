# Real Estate Investor Dashboard

A modern web application for searching, analyzing, and underwriting investment properties across Canada.

## Features

- **Property Search**: Advanced filtering by location, price, beds, property type
- **Listing Details**: Comprehensive property information with photos and maps
- **Live Underwriting**: Interactive sliders for down payment, interest rate, and amortization
- **Rent Estimates**: P25/P50/P75 rental income projections with visual charts
- **Saved Searches**: Create and manage search criteria with investment thresholds
- **Live Alerts**: Real-time notifications via Server-Sent Events when properties match criteria
- **Responsive Design**: Mobile-first design that works on all devices

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: Zustand for global assumptions
- **Data Fetching**: TanStack Query (React Query)
- **Charts**: Recharts for rent estimate visualizations
- **Maps**: React Leaflet (when enabled)
- **Notifications**: Sonner for toast messages

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

1. **Clone and navigate to the web directory**

   ```bash
   cd web
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your configuration:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8080        # API Gateway
   NEXT_PUBLIC_ALERTS_SSE=http://localhost:8082/sse # Alerts dev server
   NEXT_PUBLIC_MAPS=disabled                        # or 'leaflet'
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Prerequisites Services

Ensure these services are running:

- API Gateway on port 8080
- Alerts SSE server on port 8082

From the root directory:

```bash
npm run dev:all        # Start all microservices
npm run start:alerts-dev  # Start alerts dev server
```

## Available Scripts

- `npm run dev` - Start development server on port 3000
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Check TypeScript without emitting files

## Project Structure

```
web/
├── app/                          # Next.js App Router
│   ├── (auth)/signin/           # Authentication pages
│   ├── (dashboard)/             # Main dashboard pages
│   │   ├── layout.tsx          # Dashboard layout with navigation
│   │   ├── page.tsx            # Search page (home)
│   │   ├── listings/[id]/      # Listing detail page
│   │   ├── saved-searches/     # Saved searches management
│   │   ├── assumptions/        # Default assumptions settings
│   │   └── alerts/             # Live alerts page
│   ├── api/route-types.d.ts    # Shared API types
│   ├── layout.tsx              # Root layout
│   └── providers.tsx           # React Query provider
├── components/                  # Reusable components
│   ├── ui/                     # shadcn/ui components
│   ├── SearchFilters.tsx       # Property search form
│   ├── ListingCard.tsx         # Property card display
│   ├── MetricGrid.tsx          # DSCR/CoC/CF/Cap rate tiles
│   ├── UWSliders.tsx           # Underwriting assumption sliders
│   ├── RentChart.tsx           # P25/P50/P75 rent visualization
│   └── ThresholdEditor.tsx     # Saved search creation dialog
├── lib/                        # Utilities and configurations
│   ├── api.ts                  # Typed API client (React Query)
│   ├── sse.ts                  # Server-Sent Events helper
│   ├── money.ts                # Currency formatting utilities
│   ├── format.ts               # Date and text formatting
│   └── constants.ts            # App constants and enums
└── store/                      # State management
    └── useAssumptions.ts       # Global underwriting assumptions
```

## API Integration

The dashboard expects these API endpoints:

- `GET /properties/search` - Property search with filters
- `GET /properties/{id}` - Detailed property information
- `POST /underwrite` - Real-time underwriting calculations
- `GET /saved-searches` - User's saved search criteria
- `POST /saved-searches` - Create new saved search
- `GET /alerts` - Recent alert history

## Features Overview

### Property Search

- Filter by city, property type, bedrooms, max price
- Real-time search results with property cards
- Responsive grid layout

### Listing Details

- Tabbed interface: Overview, Underwrite, Photos, Map
- Property metrics and rent estimates
- Interactive underwriting with live updates

### Live Underwriting

- Sliders for down payment (5-35%), interest rate (3-8%), amortization (20-30 years)
- Real-time DSCR, Cash-on-Cash, Cash Flow, and Cap Rate calculations
- Optimistic UI updates while API processes

### Saved Searches

- Create searches with property filters and investment thresholds
- Plan-based limits (Free: 2 searches, Starter: 10, Pro: 50)
- Threshold-based alerts for DSCR, CoC, Cap Rate, positive cash flow

### Live Alerts

- Server-Sent Events connection to alerts service
- Real-time property notifications
- Historical alerts with search integration

## Development

### Adding New Components

1. Create component in `components/` directory
2. Use TypeScript and shadcn/ui components
3. Follow responsive design patterns
4. Add proper accessibility attributes

### API Integration

1. Add types to `app/api/route-types.d.ts`
2. Create client functions in `lib/api.ts`
3. Use React Query for caching and state management

### Styling Guidelines

- Use Tailwind utility classes
- Follow shadcn/ui design system
- Implement mobile-first responsive design
- Use consistent spacing (multiples of 4)

## Deployment

1. **Build the application**

   ```bash
   npm run build
   ```

2. **Start production server**

   ```bash
   npm start
   ```

3. **Environment Variables**
   Set production API URLs in your deployment environment

## Contributing

1. Follow TypeScript strict mode
2. Use ESLint and Prettier for code formatting
3. Write responsive, accessible components
4. Test on mobile devices
5. Update this README for new features

## License

Private - Real Estate Microservices Project
