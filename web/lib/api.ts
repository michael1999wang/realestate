import {
  Alert,
  Assumptions,
  Listing,
  ListingDetail,
  SavedSearch,
  UWMetrics,
} from "@/app/api/route-types";

const BASE = process.env.NEXT_PUBLIC_API_URL!;

async function j<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  searchListings: (params: Record<string, string | number>) =>
    j<{ items: Listing[] }>(
      `${BASE}/properties/search?` +
        new URLSearchParams(params as Record<string, string>)
    ),

  getListing: (id: string) => j<ListingDetail>(`${BASE}/properties/${id}`),

  underwrite: (body: { listingId: string; assumptions: Assumptions }) =>
    j<{ metrics: UWMetrics }>(`${BASE}/underwrite`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSavedSearches: () => j<SavedSearch[]>(`${BASE}/saved-searches`),

  createSavedSearch: (s: SavedSearch) =>
    j<SavedSearch>(`${BASE}/saved-searches`, {
      method: "POST",
      body: JSON.stringify(s),
    }),

  getAlerts: () => j<Alert[]>(`${BASE}/alerts`),
};
