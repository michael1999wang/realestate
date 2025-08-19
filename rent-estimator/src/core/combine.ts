import { RentMethod } from './dto';

export function combineEstimates({ priors, comps }: {
  priors?: { p25?: number; p50?: number; p75?: number } | null,
  comps: Array<{ id: string; rent: number; distanceKm?: number; daysOld?: number; beds?: number; baths?: number; sqft?: number }>
}): {
  method: RentMethod;
  p25?: number;
  p50: number;
  p75?: number;
  stdev?: number;
  usedComps: Array<{ id: string; rent: number; beds?: number; baths?: number; sqft?: number; distanceKm?: number; daysOld?: number }>;
} {
  const n = comps?.length ?? 0;
  
  // If no comps and we have priors, use priors only
  if (!n && priors?.p50) {
    return { 
      method: "priors", 
      p25: priors.p25, 
      p50: priors.p50!, 
      p75: priors.p75, 
      stdev: undefined, 
      usedComps: [] 
    };
  }

  // If no comps and no priors, we can't estimate
  if (!n && !priors?.p50) {
    throw new Error("Cannot estimate rent without comps or priors");
  }

  // Weight comps by recency & distance (simple inverse weighting)
  const weights = comps.map(c => {
    const distanceWeight = 1 / (1 + (c.distanceKm ?? 1));
    const recencyWeight = 1 / (1 + (c.daysOld ?? 30) / 30);
    return distanceWeight * recencyWeight;
  });
  
  const rents = comps.map(c => c.rent);
  const p50c = weightedMedian(rents, weights);
  const p25c = percentile(rents, 0.25);
  const p75c = percentile(rents, 0.75);
  const stdev = stddev(rents);

  // Blend with priors using shrinkage when n small
  const alpha = Math.min(0.7, n / 10); // up to 0.7 weight to comps
  const p50 = priors?.p50 ? (alpha * p50c + (1 - alpha) * priors.p50) : p50c;
  const p25 = priors?.p25 ? (alpha * (p25c ?? p50c) + (1 - alpha) * priors.p25) : p25c;
  const p75 = priors?.p75 ? (alpha * (p75c ?? p50c) + (1 - alpha) * priors.p75) : p75c;

  return { 
    method: "comps", 
    p25, 
    p50, 
    p75, 
    stdev, 
    usedComps: comps.slice(0, 15) // limit to first 15 comps
  };
}

// Helper functions for statistical calculations
function weightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  // Create array of [value, weight] pairs and sort by value
  const pairs = values.map((v, i) => ({ value: v, weight: weights[i] }))
    .sort((a, b) => a.value - b.value);

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const halfWeight = totalWeight / 2;

  let cumulativeWeight = 0;
  for (const pair of pairs) {
    cumulativeWeight += pair.weight;
    if (cumulativeWeight >= halfWeight) {
      return pair.value;
    }
  }
  
  return pairs[pairs.length - 1].value;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  
  if (lower === upper) {
    return sorted[lower];
  }
  
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / (values.length - 1);
  
  return Math.sqrt(variance);
}
