import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  DollarSign,
  Home,
  MapPin,
  Star,
  TrendingUp,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { apiService } from "../services/api";
import {
  Enrichment,
  Listing,
  ListingWithAnalysis,
  RentEstimate,
} from "../types";
import { formatMoney, formatRelativeTime } from "../utils/format";

interface PipelineStage {
  name: string;
  status: "pending" | "processing" | "completed" | "error";
  description: string;
  icon: React.ComponentType<any>;
  data?: any;
}

export function EnrichmentPipeline() {
  const [selectedListing, setSelectedListing] = useState<string>("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [pipelineData, setPipelineData] = useState<ListingWithAnalysis | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadListings();
  }, []);

  useEffect(() => {
    if (selectedListing) {
      loadPipelineData(selectedListing);
    }
  }, [selectedListing]);

  const loadListings = async () => {
    try {
      const response = await apiService.getListings();
      if (response.success && response.data) {
        setListings(response.data);
        if (response.data.length > 0) {
          setSelectedListing(response.data[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to load listings:", error);
    }
  };

  const loadPipelineData = async (listingId: string) => {
    try {
      setIsLoading(true);
      const response = await apiService.getListingWithAnalysis(listingId);
      if (response.success && response.data) {
        setPipelineData(response.data);
      }
    } catch (error) {
      console.error("Failed to load pipeline data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getPipelineStages = (): PipelineStage[] => {
    if (!pipelineData) return [];

    return [
      {
        name: "Listing Ingestion",
        status: "completed",
        description: "Raw listing data from MLS/CREA",
        icon: Home,
        data: pipelineData.listing,
      },
      {
        name: "Geocoding & Location",
        status: pipelineData.enrichment?.geo ? "completed" : "pending",
        description: "Coordinates, FSA, and neighborhood data",
        icon: MapPin,
        data: pipelineData.enrichment?.geo,
      },
      {
        name: "Tax & Fee Analysis",
        status: pipelineData.enrichment?.taxes ? "completed" : "pending",
        description: "Property taxes and fee validation",
        icon: DollarSign,
        data: {
          taxes: pipelineData.enrichment?.taxes,
          fees: pipelineData.enrichment?.fees,
        },
      },
      {
        name: "Location Scoring",
        status: pipelineData.enrichment?.locationScores
          ? "completed"
          : "pending",
        description: "Walk, transit, and bike scores",
        icon: Star,
        data: pipelineData.enrichment?.locationScores,
      },
      {
        name: "Rent Estimation",
        status: pipelineData.rentEstimate ? "completed" : "processing",
        description: "Market rent analysis using comps and priors",
        icon: TrendingUp,
        data: pipelineData.rentEstimate,
      },
    ];
  };

  const getStatusIcon = (status: PipelineStage["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "processing":
        return <Clock className="h-5 w-5 text-yellow-600 animate-spin" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: PipelineStage["status"]) => {
    switch (status) {
      case "completed":
        return "border-green-200 bg-green-50";
      case "processing":
        return "border-yellow-200 bg-yellow-50";
      case "error":
        return "border-red-200 bg-red-50";
      default:
        return "border-gray-200 bg-gray-50";
    }
  };

  const stages = getPipelineStages();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <TrendingUp className="h-8 w-8 mr-3 text-primary-600" />
          Enrichment Pipeline
        </h1>
        <p className="text-gray-600 mt-1">
          Watch how raw listing data gets transformed into investment insights
        </p>
      </div>

      {/* Listing Selector */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select a listing to view its enrichment pipeline:
        </label>
        <select
          value={selectedListing}
          onChange={(e) => setSelectedListing(e.target.value)}
          className="w-full max-w-md rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {listing.address.street}, {listing.address.city} -{" "}
              {formatMoney(listing.listPrice)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pipeline Stages */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              Processing Pipeline
            </h2>

            <div className="space-y-4">
              {stages.map((stage, index) => {
                const Icon = stage.icon;
                const isLast = index === stages.length - 1;

                return (
                  <div key={stage.name} className="relative">
                    <div
                      className={`flex items-start p-4 rounded-lg border-2 ${getStatusColor(
                        stage.status
                      )}`}
                    >
                      <div className="flex-shrink-0 mr-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-300">
                          <Icon className="h-4 w-4 text-gray-600" />
                        </div>
                      </div>

                      <div className="flex-grow min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-medium text-gray-900">
                            {stage.name}
                          </h3>
                          {getStatusIcon(stage.status)}
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {stage.description}
                        </p>

                        {stage.data && stage.status === "completed" && (
                          <StageDataDisplay stage={stage} />
                        )}
                      </div>
                    </div>

                    {!isLast && (
                      <div className="flex justify-center py-2">
                        <ArrowRight className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Enrichment Summary */}
          {pipelineData?.enrichment && (
            <EnrichmentSummary enrichment={pipelineData.enrichment} />
          )}

          {/* Rent Estimate Summary */}
          {pipelineData?.rentEstimate && (
            <RentEstimateSummary rentEstimate={pipelineData.rentEstimate} />
          )}
        </div>
      )}
    </div>
  );
}

function StageDataDisplay({ stage }: { stage: PipelineStage }) {
  const renderData = () => {
    switch (stage.name) {
      case "Listing Ingestion":
        const listing = stage.data as Listing;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="font-medium text-gray-700">Price:</span>
              <span className="ml-1">{formatMoney(listing.listPrice)}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Beds/Baths:</span>
              <span className="ml-1">
                {listing.beds}/{listing.baths}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Type:</span>
              <span className="ml-1">{listing.propertyType}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Source:</span>
              <span className="ml-1">{listing.sourceBoard}</span>
            </div>
          </div>
        );

      case "Geocoding & Location":
        const geo = stage.data;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="font-medium text-gray-700">Coordinates:</span>
              <span className="ml-1">
                {geo.lat?.toFixed(4)}, {geo.lng?.toFixed(4)}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">FSA:</span>
              <span className="ml-1">{geo.fsa}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Neighborhood:</span>
              <span className="ml-1">{geo.neighborhood}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Source:</span>
              <span className="ml-1 capitalize">{geo.source}</span>
            </div>
          </div>
        );

      case "Tax & Fee Analysis":
        const { taxes, fees } = stage.data;
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="font-medium text-gray-700">Annual Taxes:</span>
              <span className="ml-1">
                {formatMoney(taxes?.annualEstimate || 0)}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Method:</span>
              <span className="ml-1 capitalize">{taxes?.method}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Condo Fee:</span>
              <span className="ml-1">
                {fees?.condoFeeMonthly
                  ? formatMoney(fees.condoFeeMonthly)
                  : "N/A"}
              </span>
            </div>
          </div>
        );

      case "Location Scoring":
        const scores = stage.data;
        return (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <span className="font-medium text-gray-700">Walk Score:</span>
              <span className="ml-1">{scores.walk}/100</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Transit Score:</span>
              <span className="ml-1">{scores.transit}/100</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Bike Score:</span>
              <span className="ml-1">{scores.bike}/100</span>
            </div>
          </div>
        );

      case "Rent Estimation":
        const estimate = stage.data as RentEstimate;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="font-medium text-gray-700">P50 Rent:</span>
              <span className="ml-1">{formatMoney(estimate.p50)}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Method:</span>
              <span className="ml-1 capitalize">{estimate.method}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Range:</span>
              <span className="ml-1">
                {formatMoney(estimate.p25 || 0)} -{" "}
                {formatMoney(estimate.p75 || 0)}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Comps Used:</span>
              <span className="ml-1">
                {estimate.featuresUsed.comps?.length || 0}
              </span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white p-3 rounded border border-gray-200">
      {renderData()}
    </div>
  );
}

function EnrichmentSummary({ enrichment }: { enrichment: Enrichment }) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Enrichment Summary
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Location Information */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 flex items-center">
            <MapPin className="h-4 w-4 mr-2" />
            Location Details
          </h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-600">Coordinates:</span>
              <span className="ml-2 font-mono">
                {enrichment.geo?.lat?.toFixed(4)},{" "}
                {enrichment.geo?.lng?.toFixed(4)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">FSA:</span>
              <span className="ml-2 font-medium">{enrichment.geo?.fsa}</span>
            </div>
            <div>
              <span className="text-gray-600">Neighborhood:</span>
              <span className="ml-2">{enrichment.geo?.neighborhood}</span>
            </div>
          </div>
        </div>

        {/* Financial Information */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 flex items-center">
            <DollarSign className="h-4 w-4 mr-2" />
            Financial Details
          </h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-600">Annual Taxes:</span>
              <span className="ml-2 font-medium">
                {formatMoney(enrichment.taxes?.annualEstimate || 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Monthly Fees:</span>
              <span className="ml-2 font-medium">
                {enrichment.fees?.condoFeeMonthly
                  ? formatMoney(enrichment.fees.condoFeeMonthly)
                  : "N/A"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Insurance:</span>
              <span className="ml-2 font-medium">
                {enrichment.costRules?.insuranceMonthlyEstimate
                  ? formatMoney(enrichment.costRules.insuranceMonthlyEstimate)
                  : "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Location Scores */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 flex items-center">
            <Star className="h-4 w-4 mr-2" />
            Location Scores
          </h3>
          <div className="space-y-2">
            {enrichment.locationScores && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Walk Score</span>
                  <span className="font-medium">
                    {enrichment.locationScores.walk}/100
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Transit Score</span>
                  <span className="font-medium">
                    {enrichment.locationScores.transit}/100
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Bike Score</span>
                  <span className="font-medium">
                    {enrichment.locationScores.bike}/100
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <span>Enrichment Version: {enrichment.enrichmentVersion}</span>
          <span>Computed: {formatRelativeTime(enrichment.computedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function RentEstimateSummary({ rentEstimate }: { rentEstimate: RentEstimate }) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Rent Estimate Analysis
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Rent Estimates */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">Rent Estimates</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">P25 (Conservative)</span>
              <span className="font-medium">
                {formatMoney(rentEstimate.p25 || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">P50 (Expected)</span>
              <span className="font-medium text-lg">
                {formatMoney(rentEstimate.p50)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">P75 (Optimistic)</span>
              <span className="font-medium">
                {formatMoney(rentEstimate.p75 || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Method & Quality */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">Estimation Quality</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-600">Method:</span>
              <span className="ml-2 font-medium capitalize">
                {rentEstimate.method}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Comparables Used:</span>
              <span className="ml-2 font-medium">
                {rentEstimate.featuresUsed.comps?.length || 0}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Standard Deviation:</span>
              <span className="ml-2 font-medium">
                {formatMoney(rentEstimate.stdev || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Property Features */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">Property Features</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-600">Beds/Baths:</span>
              <span className="ml-2 font-medium">
                {rentEstimate.featuresUsed.beds}/
                {rentEstimate.featuresUsed.baths}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Square Feet:</span>
              <span className="ml-2 font-medium">
                {rentEstimate.featuresUsed.sqft
                  ? formatNumber(rentEstimate.featuresUsed.sqft)
                  : "N/A"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Type:</span>
              <span className="ml-2 font-medium">
                {rentEstimate.featuresUsed.propertyType}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Location:</span>
              <span className="ml-2 font-medium">
                {rentEstimate.featuresUsed.city}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
