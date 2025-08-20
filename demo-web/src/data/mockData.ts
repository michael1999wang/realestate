import {
  Alert,
  Enrichment,
  Listing,
  ListingWithAnalysis,
  RentEstimate,
  SavedSearch,
  SystemHealth,
  UnderwritingResult,
} from "../types";

// Mock Listings Data
export const mockListings: Listing[] = [
  {
    id: "listing-toronto-1",
    mlsNumber: "C5123456",
    sourceBoard: "TRREB",
    status: "Active",
    listedAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T14:30:00Z",
    address: {
      street: "123 King St W, Unit 1205",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 3M8",
      country: "Canada",
    },
    propertyType: "Condo",
    beds: 2,
    baths: 2,
    sqft: 850,
    yearBuilt: 2018,
    listPrice: 875000,
    taxesAnnual: 4200,
    condoFeeMonthly: 580,
    media: {
      photos: [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800",
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
      ],
    },
    brokerage: {
      name: "RE/MAX Premier",
      phone: "416-555-0123",
    },
  },
  {
    id: "listing-toronto-2",
    mlsNumber: "C5234567",
    sourceBoard: "TRREB",
    status: "Active",
    listedAt: "2024-01-14T10:15:00Z",
    updatedAt: "2024-01-15T16:45:00Z",
    address: {
      street: "456 Queen St E, Unit 802",
      city: "Toronto",
      province: "ON",
      postalCode: "M5A 1T4",
      country: "Canada",
    },
    propertyType: "Condo",
    beds: 1,
    baths: 1,
    sqft: 550,
    yearBuilt: 2020,
    listPrice: 625000,
    taxesAnnual: 3800,
    condoFeeMonthly: 425,
    media: {
      photos: [
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
      ],
    },
    brokerage: {
      name: "Century 21",
      phone: "416-555-0456",
    },
  },
  {
    id: "listing-vancouver-1",
    mlsNumber: "R2789012",
    sourceBoard: "CREA",
    status: "Active",
    listedAt: "2024-01-13T09:30:00Z",
    updatedAt: "2024-01-15T11:20:00Z",
    address: {
      street: "789 Granville St, Unit 2108",
      city: "Vancouver",
      province: "BC",
      postalCode: "V6Z 1K4",
      country: "Canada",
    },
    propertyType: "Condo",
    beds: 2,
    baths: 2,
    sqft: 900,
    yearBuilt: 2016,
    listPrice: 1200000,
    taxesAnnual: 5600,
    condoFeeMonthly: 485,
    media: {
      photos: [
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800",
      ],
    },
    brokerage: {
      name: "Sutton Group",
      phone: "604-555-0789",
    },
  },
  {
    id: "listing-calgary-1",
    mlsNumber: "A1345678",
    sourceBoard: "CREA",
    status: "Active",
    listedAt: "2024-01-12T14:00:00Z",
    updatedAt: "2024-01-15T09:15:00Z",
    address: {
      street: "321 Bow Valley Trail, Unit 1506",
      city: "Calgary",
      province: "AB",
      postalCode: "T2P 3J2",
      country: "Canada",
    },
    propertyType: "Condo",
    beds: 2,
    baths: 2,
    sqft: 1100,
    yearBuilt: 2019,
    listPrice: 465000,
    taxesAnnual: 2800,
    condoFeeMonthly: 350,
    media: {
      photos: [
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      ],
    },
    brokerage: {
      name: "Royal LePage",
      phone: "403-555-0321",
    },
  },
];

// Mock Enrichments Data
export const mockEnrichments: Enrichment[] = [
  {
    listingId: "listing-toronto-1",
    listingVersion: 1,
    enrichmentVersion: "1.2.0",
    geo: {
      lat: 43.6461,
      lng: -79.3808,
      fsa: "M5V",
      neighborhood: "Entertainment District",
      source: "listing",
    },
    taxes: {
      annualEstimate: 4200,
      method: "exact",
      notes: "From listing data",
    },
    fees: {
      condoFeeMonthly: 580,
      sanityFlags: [],
    },
    rentPriors: {
      p25: 2800,
      p50: 3200,
      p75: 3800,
      source: "cmhc",
      metro: "Toronto",
      fsa: "M5V",
      asOf: "2024-01-01T00:00:00Z",
    },
    locationScores: {
      walk: 98,
      transit: 95,
      bike: 85,
      provider: "walkscore",
    },
    costRules: {
      lttRule: "toronto_double",
      insuranceMonthlyEstimate: 85,
    },
    computedAt: "2024-01-15T14:35:00Z",
  },
  {
    listingId: "listing-toronto-2",
    listingVersion: 1,
    enrichmentVersion: "1.2.0",
    geo: {
      lat: 43.6591,
      lng: -79.357,
      fsa: "M5A",
      neighborhood: "Corktown",
      source: "geocoded",
    },
    taxes: {
      annualEstimate: 3800,
      method: "exact",
    },
    fees: {
      condoFeeMonthly: 425,
    },
    rentPriors: {
      p25: 2200,
      p50: 2600,
      p75: 3000,
      source: "cmhc",
      metro: "Toronto",
      fsa: "M5A",
      asOf: "2024-01-01T00:00:00Z",
    },
    locationScores: {
      walk: 92,
      transit: 88,
      bike: 78,
      provider: "walkscore",
    },
    costRules: {
      lttRule: "toronto_double",
      insuranceMonthlyEstimate: 65,
    },
    computedAt: "2024-01-15T16:50:00Z",
  },
];

// Mock Rent Estimates
export const mockRentEstimates: RentEstimate[] = [
  {
    listingId: "listing-toronto-1",
    listingVersion: 1,
    estimatorVersion: "1.0.0",
    method: "comps",
    p25: 2900,
    p50: 3300,
    p75: 3700,
    stdev: 250,
    featuresUsed: {
      beds: 2,
      baths: 2,
      sqft: 850,
      propertyType: "Condo",
      city: "Toronto",
      fsa: "M5V",
      comps: [
        {
          id: "comp-1",
          rent: 3200,
          beds: 2,
          baths: 2,
          sqft: 820,
          distanceKm: 0.3,
          daysOld: 15,
        },
        {
          id: "comp-2",
          rent: 3400,
          beds: 2,
          baths: 2,
          sqft: 900,
          distanceKm: 0.5,
          daysOld: 28,
        },
      ],
      priors: {
        source: "cmhc",
        city: "Toronto",
        fsa: "M5V",
        asOf: "2024-01-01T00:00:00Z",
        p25: 2800,
        p50: 3200,
        p75: 3800,
      },
    },
    computedAt: "2024-01-15T15:00:00Z",
  },
];

// Mock Underwriting Results
export const mockUnderwritingResults: UnderwritingResult[] = [
  {
    listingId: "listing-toronto-1",
    listingVersion: 1,
    resultId: "uw-result-1",
    source: "grid",
    rentScenario: "P50",
    downPct: 0.25,
    rateBps: 475,
    amortMonths: 300,
    metrics: {
      noi: 31200, // (3300 * 12) - (580 * 12) - 4200 - (85 * 12) = 39600 - 6960 - 4200 - 1020
      capRate: 0.0356,
      cashFlow: 12180, // NOI - debt service
      coc: 0.0555, // Cash flow / down payment
      dscr: 1.64, // NOI / debt service
      breakeven: 0.72,
      price: 875000,
      downPayment: 218750,
      loanAmount: 656250,
      monthlyDS: 2585,
    },
    score: 0.75,
    computedAt: "2024-01-15T15:15:00Z",
  },
];

// Mock Saved Searches
export const mockSavedSearches: SavedSearch[] = [
  {
    id: "search-1",
    userId: "user-demo",
    name: "Toronto Downtown Condos",
    filter: {
      city: "Toronto",
      province: "ON",
      propertyType: "Condo",
      minBeds: 1,
      maxPrice: 900000,
    },
    thresholds: {
      minDSCR: 1.25,
      minCoC: 0.05,
      minCapRate: 0.035,
      requireNonNegativeCF: true,
    },
    notify: {
      channel: ["devbrowser", "email"],
    },
    isActive: true,
  },
  {
    id: "search-2",
    userId: "user-demo",
    name: "High Cash Flow Properties",
    filter: {
      province: "ON",
      maxPrice: 600000,
    },
    thresholds: {
      minDSCR: 1.2,
      minCoC: 0.08,
      requireNonNegativeCF: true,
    },
    notify: {
      channel: ["devbrowser"],
    },
    isActive: true,
  },
];

// Mock Alerts
export const mockAlerts: Alert[] = [
  {
    id: "alert-1",
    userId: "user-demo",
    listingId: "listing-toronto-1",
    searchId: "search-1",
    resultId: "uw-result-1",
    score: 0.75,
    triggeredAt: "2024-01-15T15:20:00Z",
    channels: ["devbrowser", "email"],
    delivered: true,
  },
];

// Mock System Health
export const mockSystemHealth: SystemHealth = {
  services: [
    {
      name: "Ingestor",
      status: "healthy",
      lastCheck: "2024-01-15T16:00:00Z",
      metrics: {
        eventsProcessed: 1247,
        errors: 0,
        uptime: 99.9,
      },
    },
    {
      name: "Enrichment",
      status: "healthy",
      lastCheck: "2024-01-15T16:00:00Z",
      metrics: {
        eventsProcessed: 1195,
        errors: 2,
        uptime: 99.8,
      },
    },
    {
      name: "Rent Estimator",
      status: "healthy",
      lastCheck: "2024-01-15T16:00:00Z",
      metrics: {
        eventsProcessed: 1156,
        errors: 1,
        uptime: 99.9,
      },
    },
    {
      name: "Underwriting",
      status: "healthy",
      lastCheck: "2024-01-15T16:00:00Z",
      metrics: {
        eventsProcessed: 1134,
        errors: 0,
        uptime: 100.0,
      },
    },
    {
      name: "Alerts",
      status: "healthy",
      lastCheck: "2024-01-15T16:00:00Z",
      metrics: {
        eventsProcessed: 89,
        errors: 0,
        uptime: 99.9,
      },
    },
  ],
  eventBus: {
    status: "healthy",
    queueDepth: 12,
  },
  database: {
    status: "healthy",
    connectionPool: 85,
  },
};

// Combined data for easier access
export const mockData = {
  listings: mockListings,
  enrichments: mockEnrichments,
  rentEstimates: mockRentEstimates,
  underwritingResults: mockUnderwritingResults,
  savedSearches: mockSavedSearches,
  alerts: mockAlerts,
  systemHealth: mockSystemHealth,
};

// Helper function to get listing with all analysis data
export function getListingWithAnalysis(
  listingId: string
): ListingWithAnalysis | null {
  const listing = mockListings.find((l) => l.id === listingId);
  if (!listing) return null;

  return {
    listing,
    enrichment: mockEnrichments.find((e) => e.listingId === listingId),
    rentEstimate: mockRentEstimates.find((r) => r.listingId === listingId),
    underwriting: mockUnderwritingResults.filter(
      (u) => u.listingId === listingId
    ),
    alerts: mockAlerts.filter((a) => a.listingId === listingId),
  };
}

// Simulate real-time data updates
export function generateNewListing(): Listing {
  const cities = ["Toronto", "Vancouver", "Calgary", "Montreal"];
  const provinces = ["ON", "BC", "AB", "QC"];
  const propertyTypes: Array<"Condo" | "House" | "Townhouse"> = [
    "Condo",
    "House",
    "Townhouse",
  ];

  const city = cities[Math.floor(Math.random() * cities.length)];
  const province = provinces[cities.indexOf(city)];
  const propertyType =
    propertyTypes[Math.floor(Math.random() * propertyTypes.length)];

  return {
    id: `listing-${Date.now()}`,
    mlsNumber: `C${Math.floor(Math.random() * 1000000)}`,
    sourceBoard: Math.random() > 0.5 ? "TRREB" : "CREA",
    status: "Active",
    listedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    address: {
      street: `${Math.floor(Math.random() * 9999)} Example St`,
      city,
      province,
      postalCode: "M5V 3M8",
      country: "Canada",
    },
    propertyType,
    beds: Math.floor(Math.random() * 4) + 1,
    baths: Math.floor(Math.random() * 3) + 1,
    sqft: Math.floor(Math.random() * 1000) + 500,
    yearBuilt: Math.floor(Math.random() * 30) + 1995,
    listPrice: Math.floor(Math.random() * 1000000) + 400000,
    taxesAnnual: Math.floor(Math.random() * 5000) + 2000,
    condoFeeMonthly:
      propertyType === "Condo"
        ? Math.floor(Math.random() * 500) + 300
        : undefined,
    media: {
      photos: [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800",
      ],
    },
  };
}
