"use client";

import { Listing } from "@/app/api/route-types";
import { ListingCard } from "@/components/ListingCard";
import {
  SearchFilters,
  SearchFilters as SearchFiltersType,
} from "@/components/SearchFilters";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export default function SearchPage() {
  const [filters, setFilters] = useState<SearchFiltersType>({});
  const [hasSearched, setHasSearched] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["listings", filters],
    queryFn: () => {
      // Filter out undefined values and convert to proper format for API
      const cleanFilters = Object.entries(filters)
        .filter(([, value]) => value !== undefined && value !== "")
        .reduce(
          (acc, [key, value]) => ({ ...acc, [key]: value }),
          {} as Record<string, string | number>
        );
      return api.searchListings(cleanFilters);
    },
    enabled: hasSearched,
  });

  const handleSearch = (newFilters: SearchFiltersType) => {
    setFilters(newFilters);
    setHasSearched(true);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Find Your Next Investment Property
        </h1>
        <p className="text-lg text-gray-600">
          Search, analyze, and underwrite properties across Canada
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <SearchFilters onSearch={handleSearch} loading={isLoading} />
        </div>

        <div className="lg:col-span-3">
          {!hasSearched && (
            <div className="text-center py-12">
              <p className="text-gray-500">
                Use the filters to search for properties
              </p>
            </div>
          )}

          {hasSearched && isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-200 h-48 rounded-t-lg"></div>
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    <div className="h-8 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasSearched && error && (
            <div className="text-center py-12">
              <p className="text-red-600">
                Error loading properties. Please try again.
              </p>
            </div>
          )}

          {hasSearched && data && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  {data.items.length} Properties Found
                </h2>
              </div>

              {data.items.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">
                    No properties match your criteria
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {data.items.map((listing: Listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
