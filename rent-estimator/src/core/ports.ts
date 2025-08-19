import { RentEstimate, UnderwriteRequestedEvt } from "./dto";

// Read listing + enrichment snapshot
export interface ReadPort {
  getListingSnapshot(id: string): Promise<{
    id: string;
    updatedAt: string;
    address: { city: string; province: string; postalCode?: string; lat?: number; lng?: number; fsa?: string };
    beds: number; 
    baths: number; 
    sqft?: number; 
    propertyType: string;
  } | null>;
  
  getEnrichment(id: string): Promise<{
    rentPriors?: { p25?: number; p50?: number; p75?: number; source?: string; city?: string; fsa?: string; asOf?: string };
    geo?: { lat?: number; lng?: number; fsa?: string };
  } | null>;
}

// Persist estimate
export interface RentRepoPort {
  getByListingId(id: string): Promise<RentEstimate | null>;
  upsert(est: RentEstimate): Promise<{ changed: boolean }>;
}

// Event bus
export interface BusPort {
  subscribe(topic: "listing_changed" | "data_enriched", handler: (e: any) => Promise<void>): Promise<void>;
  publish(evt: UnderwriteRequestedEvt): Promise<void>;
}

// External sources (mockable)
export interface PriorsPort {
  fetchPriors(params: { 
    city?: string; 
    fsa?: string; 
    beds?: number; 
    propertyType?: string 
  }): Promise<{ p25?: number; p50?: number; p75?: number; asOf?: string } | null>;
}

export interface CompsPort {
  // return recent rental comps near (lat,lng) with filters
  searchComps(params: {
    lat?: number; 
    lng?: number; 
    city?: string; 
    fsa?: string;
    beds?: number; 
    baths?: number; 
    sqft?: number;
    propertyType?: string;
    radiusKm?: number; 
    daysBack?: number;
  }): Promise<Array<{ 
    id: string; 
    rent: number; 
    beds?: number; 
    baths?: number; 
    sqft?: number; 
    distanceKm?: number; 
    daysOld?: number 
  }>>;
}

// Cache (Redis)
export interface CachePort {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, val: any, ttlSec: number): Promise<void>;
}
