import crypto from "crypto";
import { Listing, ListingStatus, PropertyType } from "./dto";

export function stableAddressHash(raw: any): string {
  const key = `${raw.Address?.StreetNumber} ${raw.Address?.StreetName}|${raw.Address?.City}|${raw.Address?.PostalCode}`;
  return crypto.createHash("sha1").update(key).digest("hex");
}

const statusMap: Record<string, ListingStatus> = {
  A: "Active",
  Sld: "Sold",
  Sus: "Suspended",
  Exp: "Expired",
};

export function normalizeTreb(raw: any): Listing {
  return {
    id: raw.MlsNumber ?? stableAddressHash(raw),
    mlsNumber: raw.MlsNumber,
    sourceBoard: "TRREB",
    status: statusMap[raw.Status] ?? "Active",
    listedAt: raw.ListDate,
    updatedAt: raw.Updated,
    address: {
      street: [raw.Address?.StreetNumber, raw.Address?.StreetName]
        .filter(Boolean)
        .join(" "),
      city: raw.Address?.City,
      province: "ON",
      postalCode: raw.Address?.PostalCode,
      lat: raw.Geo?.Latitude,
      lng: raw.Geo?.Longitude,
    },
    propertyType: mapPropType(raw.PropertyType),
    beds: raw.BedroomsTotal ?? 0,
    baths: raw.BathroomsTotalInteger ?? 0,
    sqft: raw.LivingArea ?? undefined,
    yearBuilt: raw.YearBuilt ?? undefined,
    listPrice: raw.ListPrice,
    taxesAnnual: raw.TaxAnnualAmount,
    condoFeeMonthly: raw.AssociationFee ?? raw.MaintenanceFee,
    media: { photos: (raw.Media ?? []).map((m: any) => m.MediaURL) },
    brokerage: raw.ListOffice
      ? { name: raw.ListOffice.Name, phone: raw.ListOffice.Phone }
      : undefined,
    raw,
  };
}

function mapPropType(s: string): PropertyType {
  if (!s) return "CondoApt";
  const t = s.toLowerCase();
  if (t.includes("condo")) return "CondoApt";
  if (t.includes("town")) return "Townhouse";
  if (t.includes("semi")) return "Semi";
  if (t.includes("multi")) return "Multiplex";
  return "Detached";
}
