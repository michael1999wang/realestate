"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PROPERTY_TYPES } from "@/lib/constants";
import { Search } from "lucide-react";
import { useState } from "react";

interface SearchFiltersProps {
  onSearch: (filters: SearchFilters) => void;
  loading?: boolean;
}

export interface SearchFilters {
  q?: string;
  city?: string;
  propertyType?: string;
  minBeds?: number;
  maxPrice?: number;
}

export function SearchFilters({
  onSearch,
  loading = false,
}: SearchFiltersProps) {
  const [filters, setFilters] = useState<SearchFilters>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(filters);
  };

  const updateFilter = (
    key: keyof SearchFilters,
    value: string | number | undefined
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">Search Filters</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Search</label>
          <Input
            placeholder="Address, neighborhood, MLS..."
            value={filters.q || ""}
            onChange={(e) => updateFilter("q", e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">City</label>
          <Input
            placeholder="Toronto, Vancouver..."
            value={filters.city || ""}
            onChange={(e) => updateFilter("city", e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">
            Property Type
          </label>
          <select
            className="w-full p-2 border rounded-md"
            value={filters.propertyType || ""}
            onChange={(e) => updateFilter("propertyType", e.target.value)}
          >
            <option value="">All Types</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Min Beds</label>
            <Input
              type="number"
              min="0"
              max="10"
              value={filters.minBeds || ""}
              onChange={(e) =>
                updateFilter("minBeds", parseInt(e.target.value) || undefined)
              }
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Max Price</label>
            <Input
              type="number"
              min="0"
              step="50000"
              placeholder="1000000"
              value={filters.maxPrice || ""}
              onChange={(e) =>
                updateFilter("maxPrice", parseInt(e.target.value) || undefined)
              }
            />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          <Search className="w-4 h-4 mr-2" />
          {loading ? "Searching..." : "Search Properties"}
        </Button>
      </form>
    </Card>
  );
}
