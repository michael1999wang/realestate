"use client";

import { Listing } from "@/app/api/route-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPropertyType } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { Bath, Bed, Eye, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface ListingCardProps {
  listing: Listing;
  metrics?: {
    dscr?: number;
    cashOnCashPct?: number;
  };
}

export function ListingCard({ listing, metrics }: ListingCardProps) {
  const primaryPhoto = listing.media?.photos?.[0];

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative h-48">
        {primaryPhoto ? (
          <Image
            src={primaryPhoto}
            alt={`${listing.address?.street || "Property"} photo`}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-500">No photo</span>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary">
            {formatPropertyType(listing.propertyType)}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-green-600">
            {formatMoney(listing.listPrice)}
          </h3>
          {listing.address?.street && (
            <p className="text-sm text-gray-600 flex items-center">
              <MapPin className="w-3 h-3 mr-1" />
              {listing.address.street}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {listing.city}, {listing.province}
          </p>
        </div>

        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <div className="flex items-center">
            <Bed className="w-4 h-4 mr-1" />
            {listing.beds} bed{listing.beds !== 1 ? "s" : ""}
          </div>
          <div className="flex items-center">
            <Bath className="w-4 h-4 mr-1" />
            {listing.baths} bath{listing.baths !== 1 ? "s" : ""}
          </div>
        </div>

        {metrics && (
          <div className="flex space-x-2">
            {metrics.dscr && (
              <Badge variant="outline" className="text-xs">
                DSCR: {metrics.dscr.toFixed(2)}
              </Badge>
            )}
            {metrics.cashOnCashPct && (
              <Badge variant="outline" className="text-xs">
                CoC: {(metrics.cashOnCashPct * 100).toFixed(1)}%
              </Badge>
            )}
          </div>
        )}

        <Link href={`/listings/${listing.id}`} className="block">
          <Button variant="outline" className="w-full">
            <Eye className="w-4 h-4 mr-2" />
            View Details
          </Button>
        </Link>
      </div>
    </Card>
  );
}
