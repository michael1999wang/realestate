export type ISO = string;
export type Money = number;

export interface Address {
  street: string;
  city: string;
  province: string; // e.g., "ON"
  postalCode?: string;
  lat?: number;
  lng?: number;
}

export type PropertyType =
  | "CondoApt"
  | "Detached"
  | "Townhouse"
  | "Semi"
  | "Multiplex";
export type ListingStatus = "Active" | "Sold" | "Suspended" | "Expired";

export interface Listing {
  id: string; // internal stable id (MLS# else address hash)
  mlsNumber?: string;
  sourceBoard: "TRREB" | "CREA" | "MOCK";
  status: ListingStatus;
  listedAt: ISO;
  updatedAt: ISO;

  address: Address;
  propertyType: PropertyType;
  beds: number;
  baths: number;
  sqft?: number;
  yearBuilt?: number;

  listPrice: Money;
  taxesAnnual?: Money;
  condoFeeMonthly?: Money;

  media?: { photos: string[]; tourUrl?: string };
  brokerage?: { name: string; phone?: string };

  raw?: unknown; // original payload for debugging
}

export type DirtyField =
  | "price"
  | "status"
  | "fees"
  | "tax"
  | "media"
  | "address";

export interface ListingChangedEvent {
  type: "listing_changed";
  id: string;
  updatedAt: ISO;
  change: "create" | "update" | "status_change";
  source: "TRREB" | "CREA" | "MOCK";
  dirty?: DirtyField[];
}
