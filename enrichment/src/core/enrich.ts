import { Enrichment } from "./dto";
import {
  CachePort,
  CMHCPort,
  EnrichmentRepoPort,
  GeocoderPort,
  ListingReadPort,
  TaxesPort,
  WalkScorePort,
} from "./ports";
import { enrichmentVersion } from "./versioning";

export async function enrichOne(
  listingId: string,
  deps: {
    listingRepo: ListingReadPort;
    enrRepo: EnrichmentRepoPort;
    walk: WalkScorePort;
    cmhc: CMHCPort;
    taxes: TaxesPort;
    geo: GeocoderPort;
    cache: CachePort;
  }
): Promise<{ changed: boolean; enrichment?: Enrichment }> {
  const snap = await deps.listingRepo.getListingById(listingId);
  if (!snap) return { changed: false };

  // GEO
  let { lat, lng } = snap.address;
  let fsa: string | undefined;
  let neighborhood: string | undefined;
  let geoSource: "listing" | "geocoded" = "listing";

  if (!lat || !lng) {
    const g = await deps.geo.geocode(
      snap.address.street,
      snap.address.city,
      snap.address.province,
      snap.address.postalCode
    );
    lat = lat ?? g.lat;
    lng = lng ?? g.lng;
    fsa = fsa ?? g.fsa;
    neighborhood = g.neighborhood;
    geoSource = "geocoded";
  } else {
    // Extract FSA from postal code if we have coords from listing
    if (snap.address.postalCode) {
      fsa = snap.address.postalCode.substring(0, 3).toUpperCase();
    }
  }

  // TAX
  let taxEst = snap.taxesAnnual;
  let taxMethod: "exact" | "rate_table" | "unknown" = taxEst
    ? "exact"
    : "unknown";
  if (!taxEst) {
    const { annual, method } = await deps.taxes.estimateAnnualTax({
      city: snap.address.city,
      province: snap.address.province,
      assessedValue: snap.listPrice,
    });
    taxEst = annual;
    taxMethod = method;
  }

  // FEES sanity
  const fee = snap.condoFeeMonthly;
  const sanity: string[] = [];
  if (fee === undefined || fee === null) {
    sanity.push("fee_missing");
  } else if (fee < 50 || fee > 2500) {
    sanity.push("fee_outlier");
  }

  // RENT PRIORS (cache by fsa/city + beds)
  const cacheKey = `rentpriors:${snap.address.city}:${fsa ?? "NA"}:${
    snap.propertyType
  }`;
  let priors = await deps.cache.get<any>(cacheKey);
  if (!priors) {
    priors = await deps.cmhc.getRentPriors({
      city: snap.address.city,
      fsa,
      propertyType: snap.propertyType,
    });
    await deps.cache.set(cacheKey, priors, 86400); // 1 day
  }

  // LOCATION SCORES (cache by lat,lng)
  let scores = undefined;
  if (lat && lng) {
    const skey = `walkscore:${lat.toFixed(4)},${lng.toFixed(4)}`;
    scores = await deps.cache.get<any>(skey);
    if (!scores) {
      scores = await deps.walk.getScores(lat, lng);
      await deps.cache.set(skey, scores, 2592000); // 30 days
    }
  }

  const enrichment: Enrichment = {
    listingId: snap.id,
    listingVersion: 1, // TODO: read from source listings table if tracked
    enrichmentVersion,
    geo: {
      lat,
      lng,
      fsa,
      neighborhood,
      source: geoSource,
    },
    taxes: {
      annualEstimate: taxEst,
      method: taxMethod,
    },
    fees: {
      condoFeeMonthly: fee,
      sanityFlags: sanity.length > 0 ? sanity : undefined,
    },
    rentPriors: {
      p25: priors?.p25,
      p50: priors?.p50,
      p75: priors?.p75,
      source: priors ? "cmhc" : "none",
      metro: snap.address.city,
      fsa,
      asOf: priors?.asOf,
    },
    locationScores: scores
      ? {
          ...scores,
          provider: "walkscore" as const,
        }
      : undefined,
    costRules: {
      lttRule: mapLttRule(snap.address.city, snap.address.province),
      insuranceMonthlyEstimate: estimateInsurance(
        snap.propertyType,
        snap.listPrice
      ),
    },
    computedAt: new Date().toISOString(),
  };

  // Diff with existing
  const prev = await deps.enrRepo.getByListingId(snap.id);
  const changed =
    JSON.stringify(stripVolatile(prev || undefined)) !==
    JSON.stringify(stripVolatile(enrichment));

  if (changed) {
    await deps.enrRepo.upsert(enrichment);
  }

  return { changed, enrichment };
}

function mapLttRule(city: string, prov: string): string {
  if (prov === "ON" && city?.toLowerCase() === "toronto")
    return "toronto_double";
  if (prov === "ON") return "ontario";
  return `${prov.toLowerCase()}_default`;
}

function estimateInsurance(propertyType: string, price: number): number {
  const base = 35; // very rough monthly base
  return Math.round(base + (price / 1_000_000) * 25);
}

function stripVolatile(
  e?: Enrichment
): Omit<Enrichment, "computedAt"> | undefined {
  if (!e) return e;
  const { computedAt, ...rest } = e;
  return rest;
}
