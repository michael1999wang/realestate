export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAddress(address?: {
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}): string {
  if (!address) return "";
  const parts = [
    address.street,
    address.city,
    address.province,
    address.postalCode,
  ].filter(Boolean);
  return parts.join(", ");
}

export function formatPropertyType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}
