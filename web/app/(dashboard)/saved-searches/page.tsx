"use client";

import { SavedSearch } from "@/app/api/route-types";
import { ThresholdEditor } from "@/components/ThresholdEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatMoney, formatPercent } from "@/lib/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkIcon, Edit, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SavedSearchesPage() {
  const queryClient = useQueryClient();

  const { data: searches, isLoading } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: api.getSavedSearches,
  });

  const createMutation = useMutation({
    mutationFn: api.createSavedSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      toast.success("Saved search created successfully!");
    },
    onError: (error) => {
      toast.error("Failed to create saved search");
      console.error("Create saved search error:", error);
    },
  });

  const handleCreateSearch = (search: SavedSearch) => {
    createMutation.mutate(search);
  };

  const formatFilters = (filter: SavedSearch["filter"]) => {
    const parts = [];
    if (filter.city) parts.push(`City: ${filter.city}`);
    if (filter.propertyType) parts.push(`Type: ${filter.propertyType}`);
    if (filter.minBeds) parts.push(`Min beds: ${filter.minBeds}`);
    if (filter.maxPrice)
      parts.push(`Max price: ${formatMoney(filter.maxPrice)}`);
    return parts.length > 0 ? parts.join(", ") : "No filters";
  };

  const formatThresholds = (thresholds: SavedSearch["thresholds"]) => {
    const parts = [];
    if (thresholds.minDSCR) parts.push(`DSCR ≥ ${thresholds.minDSCR}`);
    if (thresholds.minCoC)
      parts.push(`CoC ≥ ${formatPercent(thresholds.minCoC)}`);
    if (thresholds.minCapRate) parts.push(`Cap ≥ ${thresholds.minCapRate}%`);
    if (thresholds.requireNonNegativeCF) parts.push("Positive CF");
    return parts.length > 0 ? parts.join(", ") : "No thresholds";
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <BookmarkIcon className="w-6 h-6 mr-3 text-blue-600" />
            Saved Searches
          </h1>
          <p className="text-gray-600 mt-1">
            Create and manage your property search criteria and alert thresholds
          </p>
        </div>

        <ThresholdEditor
          onSave={handleCreateSearch}
          loading={createMutation.isPending}
        />
      </div>

      {/* Plan Limits Info */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-blue-900">Free Plan</p>
            <p className="text-sm text-blue-700">
              You can create up to 2 saved searches
            </p>
          </div>
          <Badge variant="outline" className="bg-white">
            {searches?.length || 0} / 2 used
          </Badge>
        </div>
      </Card>

      {/* Searches Table */}
      {!searches || searches.length === 0 ? (
        <Card className="p-8 text-center">
          <BookmarkIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No saved searches yet
          </h3>
          <p className="text-gray-600 mb-4">
            Create your first saved search to get alerts when matching
            properties are found
          </p>
          <ThresholdEditor
            onSave={handleCreateSearch}
            loading={createMutation.isPending}
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Search Criteria</TableHead>
                <TableHead>Investment Thresholds</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {searches.map((search) => (
                <TableRow key={search.id}>
                  <TableCell>
                    <div className="font-medium">{search.name}</div>
                    <div className="text-sm text-gray-500">ID: {search.id}</div>
                  </TableCell>

                  <TableCell>
                    <div className="text-sm">
                      {formatFilters(search.filter)}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-sm">
                      {formatThresholds(search.thresholds)}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm">
                        <Search className="w-4 h-4 mr-1" />
                        Run
                      </Button>
                      <Button variant="outline" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
