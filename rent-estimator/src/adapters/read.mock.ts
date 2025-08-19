import { ReadPort } from '../core/ports';

interface MockListing {
  id: string;
  updatedAt: string;
  address: { 
    city: string; 
    province: string; 
    postalCode?: string; 
    lat?: number; 
    lng?: number; 
    fsa?: string 
  };
  beds: number;
  baths: number;
  sqft?: number;
  propertyType: string;
}

interface MockEnrichment {
  rentPriors?: { 
    p25?: number; 
    p50?: number; 
    p75?: number; 
    source?: string; 
    city?: string; 
    fsa?: string; 
    asOf?: string 
  };
  geo?: { 
    lat?: number; 
    lng?: number; 
    fsa?: string 
  };
}

export class MockReadAdapter implements ReadPort {
  private listings = new Map<string, MockListing>();
  private enrichments = new Map<string, MockEnrichment>();

  constructor() {
    // Set up some mock data
    this.listings.set('listing-1', {
      id: 'listing-1',
      updatedAt: '2024-01-15T10:00:00Z',
      address: {
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M5V 3A8',
        lat: 43.6426,
        lng: -79.3871,
        fsa: 'M5V'
      },
      beds: 2,
      baths: 2,
      sqft: 900,
      propertyType: 'Condo'
    });

    this.enrichments.set('listing-1', {
      geo: {
        lat: 43.6426,
        lng: -79.3871,
        fsa: 'M5V'
      }
    });
  }

  async getListingSnapshot(id: string): Promise<MockListing | null> {
    return this.listings.get(id) ?? null;
  }

  async getEnrichment(id: string): Promise<MockEnrichment | null> {
    return this.enrichments.get(id) ?? null;
  }

  // Helper methods for testing
  addListing(listing: MockListing): void {
    this.listings.set(listing.id, listing);
  }

  addEnrichment(id: string, enrichment: MockEnrichment): void {
    this.enrichments.set(id, enrichment);
  }

  clear(): void {
    this.listings.clear();
    this.enrichments.clear();
  }

  getAllListings(): MockListing[] {
    return Array.from(this.listings.values());
  }

  getAllEnrichments(): MockEnrichment[] {
    return Array.from(this.enrichments.values());
  }
}
