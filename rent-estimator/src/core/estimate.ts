import { combineEstimates } from "./combine";
import { RentEstimate } from "./dto";
import {
  BusPort,
  CachePort,
  CompsPort,
  PriorsPort,
  ReadPort,
  RentRepoPort,
} from "./ports";
import { estimatorVersion } from "./versioning";

export async function estimateForListing(
  id: string,
  deps: {
    read: ReadPort;
    rentRepo: RentRepoPort;
    priors: PriorsPort;
    comps: CompsPort;
    cache: CachePort;
    bus: BusPort;
  }
): Promise<{ changed: boolean; estimate?: RentEstimate }> {
  const snap = await deps.read.getListingSnapshot(id);
  if (!snap) {
    console.log(`No listing snapshot found for ${id}`);
    return { changed: false };
  }

  const enr = await deps.read.getEnrichment(id);

  // PRIORS (prefer enrichment, else fetch)
  const priorsKey = `rentpriors:${enr?.geo?.fsa ?? snap.address.city}:${
    snap.beds
  }:${snap.propertyType}`;
  let priors = enr?.rentPriors ?? (await deps.cache.get(priorsKey));

  if (!priors) {
    priors = await deps.priors.fetchPriors({
      city: snap.address.city,
      fsa: enr?.geo?.fsa,
      beds: snap.beds,
      propertyType: snap.propertyType,
    });
    if (priors) {
      await deps.cache.set(priorsKey, priors, 86400); // Cache for 24 hours
    }
  }

  // COMPS (if we have geo)
  let comps: Awaited<ReturnType<CompsPort["searchComps"]>> = [];
  const radiusKm = 2.0;

  if ((enr?.geo?.lat && enr?.geo?.lng) || enr?.geo?.fsa) {
    const lat = enr?.geo?.lat;
    const lng = enr?.geo?.lng;

    try {
      comps = await deps.comps.searchComps({
        lat,
        lng,
        city: snap.address.city,
        fsa: enr?.geo?.fsa,
        beds: snap.beds,
        baths: snap.baths,
        sqft: snap.sqft,
        propertyType: snap.propertyType,
        radiusKm,
        daysBack: 120,
      });
    } catch (error) {
      console.warn(`Failed to fetch comps for listing ${id}:`, error);
      comps = [];
    }
  }

  // COMBINE
  let out;
  try {
    out = combineEstimates({ priors, comps });
  } catch (error) {
    console.error(`Failed to combine estimates for listing ${id}:`, error);
    return { changed: false };
  }

  const estimate: RentEstimate = {
    listingId: snap.id,
    listingVersion: 1,
    estimatorVersion,
    method: out.method,
    p25: out.p25,
    p50: out.p50,
    p75: out.p75,
    stdev: out.stdev,
    featuresUsed: {
      beds: snap.beds,
      baths: snap.baths,
      sqft: snap.sqft,
      propertyType: snap.propertyType,
      city: snap.address.city,
      fsa: enr?.geo?.fsa,
      comps: out.usedComps,
      priors: priors
        ? {
            source: "cmhc",
            city: snap.address.city,
            fsa: enr?.geo?.fsa,
            asOf: (priors as any)?.asOf,
            p25: (priors as any)?.p25,
            p50: (priors as any)?.p50,
            p75: (priors as any)?.p75,
          }
        : undefined,
    },
    computedAt: new Date().toISOString(),
  };

  // Write if changed materially
  const prev = await deps.rentRepo.getByListingId(snap.id);
  const changed = isMaterialChange(prev, estimate);

  if (changed) {
    const result = await deps.rentRepo.upsert(estimate);
    if (result.changed) {
      try {
        await deps.bus.publish({ type: "underwrite_requested", id: snap.id });
        console.log(
          `Published underwrite_requested for listing ${id}, p50: ${estimate.p50}, method: ${estimate.method}`
        );
      } catch (error) {
        console.error(
          `Failed to publish underwrite_requested for listing ${id}:`,
          error
        );
      }
    }
  }

  return { changed, estimate };
}

function isMaterialChange(
  a?: RentEstimate | null,
  b?: RentEstimate | null,
  pct = 0.03
): boolean {
  if (!a || !b) return true;
  if (!a.p50 || !b.p50) return true;
  return Math.abs(b.p50 - a.p50) / a.p50 >= pct;
}
