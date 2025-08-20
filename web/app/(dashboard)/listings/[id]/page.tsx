"use client";

import { MetricGrid } from "@/components/MetricGrid";
import { RentChart } from "@/components/RentChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UWSliders } from "@/components/UWSliders";
import { api } from "@/lib/api";
import { formatPropertyType } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bath, Bed, Calculator, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ListingDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api.getListing(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Error loading property details</p>
        <Link href="/">
          <Button className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Search
          </Button>
        </Link>
      </div>
    );
  }

  const { listing, enrichment, rent, latestUW } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Search
          </Button>
        </Link>
      </div>

      {/* Header */}
      <Card className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <Badge variant="secondary">
                {formatPropertyType(listing.propertyType)}
              </Badge>
              <Badge variant="outline">
                {listing.city}, {listing.province}
              </Badge>
            </div>

            <h1 className="text-3xl font-bold text-green-600 mb-2">
              {formatMoney(listing.listPrice)}
            </h1>

            {listing.address?.street && (
              <p className="text-gray-600 flex items-center mb-4">
                <MapPin className="w-4 h-4 mr-2" />
                {listing.address.street}
              </p>
            )}

            <div className="flex items-center space-x-6">
              <div className="flex items-center text-gray-600">
                <Bed className="w-5 h-5 mr-2" />
                <span>
                  {listing.beds} bed{listing.beds !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center text-gray-600">
                <Bath className="w-5 h-5 mr-2" />
                <span>
                  {listing.baths} bath{listing.baths !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="relative h-64 lg:h-48">
            {listing.media?.photos?.[0] ? (
              <Image
                src={listing.media.photos[0]}
                alt="Property photo"
                fill
                className="object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full bg-gray-200 rounded-lg flex items-center justify-center">
                <span className="text-gray-500">No photo available</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Quick Metrics */}
      {latestUW && (
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Calculator className="w-5 h-5 mr-2" />
            Current Underwriting Metrics
          </h2>
          <MetricGrid metrics={latestUW} />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="underwrite">Underwrite</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rent Estimates */}
            {rent && <RentChart rent={rent} />}

            {/* Property Details */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Property Details</h3>
              <div className="space-y-3">
                {enrichment?.taxes?.annualEstimate && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Annual Property Taxes</span>
                    <span className="font-medium">
                      {formatMoney(enrichment.taxes.annualEstimate)}
                    </span>
                  </div>
                )}

                {enrichment?.fees?.condoFeeMonthly && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Monthly Condo Fee</span>
                    <span className="font-medium">
                      {formatMoney(enrichment.fees.condoFeeMonthly)}/month
                    </span>
                  </div>
                )}

                {enrichment?.locationScores && (
                  <>
                    <div className="pt-3 border-t">
                      <h4 className="font-medium mb-2">Location Scores</h4>
                    </div>
                    {enrichment.locationScores.walk && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Walk Score</span>
                        <span className="font-medium">
                          {enrichment.locationScores.walk}/100
                        </span>
                      </div>
                    )}
                    {enrichment.locationScores.transit && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Transit Score</span>
                        <span className="font-medium">
                          {enrichment.locationScores.transit}/100
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="underwrite">
          {latestUW ? (
            <UWSliders listingId={listing.id} initialMetrics={latestUW} />
          ) : (
            <Card className="p-6 text-center">
              <p className="text-gray-600">
                No underwriting data available. Please check back later.
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="photos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listing.media?.photos?.map((photo, index) => (
              <div key={index} className="relative h-64">
                <Image
                  src={photo}
                  alt={`Property photo ${index + 1}`}
                  fill
                  className="object-cover rounded-lg"
                />
              </div>
            )) || (
              <div className="col-span-full text-center py-12">
                <p className="text-gray-500">No photos available</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="map">
          <Card className="p-6">
            {enrichment?.geo?.lat && enrichment?.geo?.lng ? (
              <div className="text-center py-12">
                <p className="text-gray-600 mb-2">
                  Map view would be displayed here
                </p>
                <p className="text-sm text-gray-500">
                  Coordinates: {enrichment.geo.lat.toFixed(6)},{" "}
                  {enrichment.geo.lng.toFixed(6)}
                </p>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">Location data not available</p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
