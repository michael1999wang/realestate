import {
  Bath,
  Bed,
  Building2,
  Calendar,
  ExternalLink,
  Filter,
  MapPin,
  RefreshCw,
  Square,
} from "lucide-react";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { Listing } from "../types";
import {
  formatMoney,
  formatRelativeTime,
  getStatusColor,
} from "../utils/format";

export function ListingsFeed() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "all",
    city: "all",
    propertyType: "all",
    minPrice: "",
    maxPrice: "",
  });
  const [isRealTime, setIsRealTime] = useState(true);

  useEffect(() => {
    loadListings();

    if (isRealTime) {
      apiService.subscribeToEvents("listings", handleNewListing);
    }

    return () => {
      apiService.unsubscribeFromEvents("listings", handleNewListing);
    };
  }, [isRealTime]);

  useEffect(() => {
    applyFilters();
  }, [listings, filters]);

  const loadListings = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getListings();
      if (response.success && response.data) {
        setListings(
          response.data.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
        );
      }
    } catch (error) {
      console.error("Failed to load listings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewListing = (event: any) => {
    if (event.type === "listing_changed" && event.data) {
      const newListing = event.data as Listing;
      setListings((prev) => [newListing, ...prev]);
    }
  };

  const applyFilters = () => {
    let filtered = [...listings];

    if (filters.status !== "all") {
      filtered = filtered.filter(
        (listing) =>
          listing.status.toLowerCase() === filters.status.toLowerCase()
      );
    }

    if (filters.city !== "all") {
      filtered = filtered.filter(
        (listing) =>
          listing.address.city.toLowerCase() === filters.city.toLowerCase()
      );
    }

    if (filters.propertyType !== "all") {
      filtered = filtered.filter(
        (listing) =>
          listing.propertyType.toLowerCase() ===
          filters.propertyType.toLowerCase()
      );
    }

    if (filters.minPrice) {
      const minPrice = parseFloat(filters.minPrice);
      filtered = filtered.filter((listing) => listing.listPrice >= minPrice);
    }

    if (filters.maxPrice) {
      const maxPrice = parseFloat(filters.maxPrice);
      filtered = filtered.filter((listing) => listing.listPrice <= maxPrice);
    }

    setFilteredListings(filtered);
  };

  const uniqueCities = Array.from(
    new Set(listings.map((l) => l.address.city))
  ).sort();
  const uniquePropertyTypes = Array.from(
    new Set(listings.map((l) => l.propertyType))
  ).sort();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Building2 className="h-8 w-8 mr-3 text-primary-600" />
              Listings Feed
            </h1>
            <p className="text-gray-600 mt-1">
              Real-time property listings from TREB and CREA
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={isRealTime}
                onChange={(e) => setIsRealTime(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">Real-time updates</span>
            </label>
            <button
              onClick={loadListings}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <Filter className="h-5 w-5 text-gray-400 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="sold">Sold</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <select
              value={filters.city}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, city: e.target.value }))
              }
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="all">All Cities</option>
              {uniqueCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Property Type
            </label>
            <select
              value={filters.propertyType}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  propertyType: e.target.value,
                }))
              }
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="all">All Types</option>
              {uniquePropertyTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Price
            </label>
            <input
              type="number"
              placeholder="0"
              value={filters.minPrice}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, minPrice: e.target.value }))
              }
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Price
            </label>
            <input
              type="number"
              placeholder="∞"
              value={filters.maxPrice}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))
              }
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {filteredListings.length}
          </div>
          <div className="text-sm text-gray-600">Total Listings</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-green-600">
            {filteredListings.filter((l) => l.status === "Active").length}
          </div>
          <div className="text-sm text-gray-600">Active</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">
            {formatMoney(
              filteredListings.reduce((sum, l) => sum + l.listPrice, 0) /
                filteredListings.length || 0
            )}
          </div>
          <div className="text-sm text-gray-600">Avg. Price</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-purple-600">
            {Math.round(
              filteredListings.reduce((sum, l) => sum + (l.sqft || 0), 0) /
                filteredListings.length || 0
            )}
          </div>
          <div className="text-sm text-gray-600">Avg. Sq Ft</div>
        </div>
      </div>

      {/* Listings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredListings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>

      {filteredListings.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No listings found
          </h3>
          <p className="text-gray-600">
            Try adjusting your filters or check back later for new listings.
          </p>
        </div>
      )}
    </div>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      {/* Image */}
      <div className="aspect-w-16 aspect-h-9 bg-gray-200">
        {listing.media?.photos?.[0] ? (
          <img
            src={listing.media.photos[0]}
            alt={listing.address.street}
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
            <Building2 className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Price and Status */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-2xl font-bold text-gray-900">
            {formatMoney(listing.listPrice)}
          </div>
          <span
            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
              listing.status
            )}`}
          >
            {listing.status}
          </span>
        </div>

        {/* Address */}
        <div className="flex items-center text-gray-600 mb-3">
          <MapPin className="h-4 w-4 mr-1" />
          <span className="text-sm">{listing.address.street}</span>
        </div>
        <div className="text-sm text-gray-600 mb-4">
          {listing.address.city}, {listing.address.province}
        </div>

        {/* Property Details */}
        <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
          <div className="flex items-center">
            <Bed className="h-4 w-4 mr-1" />
            <span>{listing.beds}</span>
          </div>
          <div className="flex items-center">
            <Bath className="h-4 w-4 mr-1" />
            <span>{listing.baths}</span>
          </div>
          <div className="flex items-center">
            <Square className="h-4 w-4 mr-1" />
            <span>{listing.sqft ? `${listing.sqft}` : "N/A"}</span>
          </div>
          <div className="text-xs">{listing.propertyType}</div>
        </div>

        {/* Additional Info */}
        <div className="text-xs text-gray-500 space-y-1">
          <div>MLS: {listing.mlsNumber || "N/A"}</div>
          <div>Source: {listing.sourceBoard}</div>
          {listing.taxesAnnual && (
            <div>Taxes: {formatMoney(listing.taxesAnnual)}/year</div>
          )}
          {listing.condoFeeMonthly && (
            <div>Condo Fee: {formatMoney(listing.condoFeeMonthly)}/month</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center text-xs text-gray-500">
            <Calendar className="h-3 w-3 mr-1" />
            <span>{formatRelativeTime(listing.updatedAt)}</span>
          </div>
          <button className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center">
            <span>View Details</span>
            <ExternalLink className="h-3 w-3 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
