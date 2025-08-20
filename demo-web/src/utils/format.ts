import { format, formatDistanceToNow } from "date-fns";

// Currency formatting
export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatMoneyShort = (amount: number): string => {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return formatMoney(amount);
};

// Percentage formatting
export const formatPercent = (
  decimal: number,
  precision: number = 1
): string => {
  return `${(decimal * 100).toFixed(precision)}%`;
};

// Number formatting

export const formatLargeNumber = (num: number): string => {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return formatNumber(num);
};

// Date formatting
export const formatDate = (date: string | Date): string => {
  return format(new Date(date), "MMM d, yyyy");
};

export const formatDateTime = (date: string | Date): string => {
  return format(new Date(date), "MMM d, yyyy h:mm a");
};

export const formatRelativeTime = (date: string | Date): string => {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

// Address formatting
export const formatAddress = (address: {
  street: string;
  city: string;
  province: string;
}): string => {
  return `${address.street}, ${address.city}, ${address.province}`;
};

export const formatShortAddress = (address: {
  city: string;
  province: string;
}): string => {
  return `${address.city}, ${address.province}`;
};

// Property details
export const formatBedsBaths = (beds: number, baths: number): string => {
  const bedStr = beds === 1 ? "1 bed" : `${beds} beds`;
  const bathStr = baths === 1 ? "1 bath" : `${baths} baths`;
  return `${bedStr}, ${bathStr}`;
};

export const formatSqft = (sqft?: number): string => {
  return sqft ? `${formatLargeNumber(sqft)} sq ft` : "Size unknown";
};

// Investment metrics formatting
export const formatMetric = (
  value: number,
  type: "money" | "percent" | "number" | "ratio",
  precision?: number
): string => {
  switch (type) {
    case "money":
      return formatMoney(value);
    case "percent":
      return formatPercent(value, precision);
    case "ratio":
      return `${value.toFixed(precision || 2)}x`;
    case "number":
    default:
      return formatNumber(value, precision || 0);
  }
};

// Status formatting
export const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case "active":
      return "status-active";
    case "sold":
      return "status-sold";
    case "suspended":
      return "status-suspended";
    case "expired":
      return "status-expired";
    case "healthy":
      return "text-success-600";
    case "degraded":
      return "text-warning-600";
    case "down":
      return "text-danger-600";
    default:
      return "text-gray-600";
  }
};

// Scoring
export const formatScore = (score?: number): string => {
  if (!score) return "N/A";
  return `${Math.round(score * 100)}/100`;
};

export const getScoreColor = (score?: number): string => {
  if (!score) return "text-gray-500";
  if (score >= 0.8) return "text-success-600";
  if (score >= 0.6) return "text-warning-600";
  return "text-danger-600";
};

// Add missing formatNumber function used elsewhere
export const formatNumber = (num: number, precision: number = 0): string => {
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(num);
};
