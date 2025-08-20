export const PROPERTY_TYPES = [
  { value: "house", label: "House" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "duplex", label: "Duplex" },
  { value: "apartment", label: "Apartment" },
];

export const PROVINCES = [
  { value: "ON", label: "Ontario" },
  { value: "BC", label: "British Columbia" },
  { value: "AB", label: "Alberta" },
  { value: "QC", label: "Quebec" },
  { value: "NS", label: "Nova Scotia" },
  { value: "NB", label: "New Brunswick" },
  { value: "MB", label: "Manitoba" },
  { value: "SK", label: "Saskatchewan" },
  { value: "PE", label: "Prince Edward Island" },
  { value: "NL", label: "Newfoundland and Labrador" },
  { value: "YT", label: "Yukon" },
  { value: "NT", label: "Northwest Territories" },
  { value: "NU", label: "Nunavut" },
];

export const RENT_SCENARIOS = [
  { value: "P25", label: "Conservative (P25)" },
  { value: "P50", label: "Moderate (P50)" },
  { value: "P75", label: "Optimistic (P75)" },
];

export const PLAN_LIMITS = {
  Free: {
    savedSearches: 2,
    alerts: false,
    exportPdf: false,
  },
  Starter: {
    savedSearches: 10,
    alerts: true,
    exportPdf: false,
  },
  Pro: {
    savedSearches: 50,
    alerts: true,
    exportPdf: true,
  },
};
