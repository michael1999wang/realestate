import { gridCfg } from "../config/env";
import { Assumptions, GridRow } from "./dto";
import { computeMetrics, validateAssumptions } from "./finance";
import { FactorsPort, SnapshotReadPort, UWRepoPort } from "./ports";

export interface GridComputeResult {
  rowsComputed: number;
  rowsUpserted: number;
}

/**
 * Generate all grid bin combinations for a listing
 * @param listingId The listing to compute grid for
 * @param snapshotRepo Repository for reading base inputs
 * @param uwRepo Repository for persisting grid results
 * @param factorsRepo Repository for mortgage factors
 * @returns Result with counts of computed and upserted rows
 */
export async function computeGrid(
  listingId: string,
  snapshotRepo: SnapshotReadPort,
  uwRepo: UWRepoPort,
  factorsRepo: FactorsPort
): Promise<GridComputeResult> {
  // Load base inputs for the listing
  const baseInputs = await snapshotRepo.loadBaseInputs(listingId);
  if (!baseInputs) {
    throw new Error(`Base inputs not found for listing ${listingId}`);
  }

  // Generate all bin combinations
  const bins = generateGridBins();

  // Pre-fetch all annuity factors we'll need
  const afCache = await prefetchAnnuityFactors(bins, factorsRepo);

  // Compute metrics for all combinations
  const gridRows: GridRow[] = [];
  let rowsComputed = 0;

  for (const bin of bins) {
    try {
      const assumptions: Assumptions = {
        downPct: bin.downPct,
        rateBps: bin.rateBps,
        amortMonths: bin.amortMonths,
        rentScenario: bin.rentScenario,
      };

      // Validate assumptions (should always pass for grid bins, but safety check)
      validateAssumptions(assumptions);

      // Get pre-cached annuity factor
      const afKey = `${bin.rateBps}-${bin.amortMonths}`;
      const af = afCache.get(afKey);
      if (!af) {
        throw new Error(`Annuity factor not found for ${afKey}`);
      }

      // Compute metrics
      const metrics = computeMetrics(baseInputs, assumptions, af);

      // Create grid row
      const gridRow: GridRow = {
        listingId: baseInputs.listingId,
        listingVersion: baseInputs.listingVersion,
        rentScenario: bin.rentScenario,
        downPctBin: bin.downPct,
        rateBpsBin: bin.rateBps,
        amortMonths: bin.amortMonths,
        metrics,
      };

      gridRows.push(gridRow);
      rowsComputed++;
    } catch (error) {
      console.warn(`Failed to compute grid row for ${listingId}`, bin, error);
      // Continue with other combinations
    }
  }

  // Bulk upsert all rows
  if (gridRows.length > 0) {
    await uwRepo.upsertGrid(gridRows);
  }

  return {
    rowsComputed,
    rowsUpserted: gridRows.length,
  };
}

/**
 * Generate all possible grid bin combinations
 * @returns Array of all bin combinations
 */
function generateGridBins(): Array<{
  downPct: number;
  rateBps: number;
  amortMonths: number;
  rentScenario: "P25" | "P50" | "P75";
}> {
  const bins = [];

  // Generate down payment bins
  const downPcts = [];
  for (
    let down = gridCfg.downMin;
    down <= gridCfg.downMax;
    down += gridCfg.downStep
  ) {
    downPcts.push(Math.round(down * 10000) / 10000); // Round to avoid floating point issues
  }

  // Generate rate bins
  const rateBps = [];
  for (
    let rate = gridCfg.rateMin;
    rate <= gridCfg.rateMax;
    rate += gridCfg.rateStep
  ) {
    rateBps.push(rate);
  }

  // Generate all combinations
  const rentScenarios: Array<"P25" | "P50" | "P75"> = ["P25", "P50", "P75"];

  for (const downPct of downPcts) {
    for (const rate of rateBps) {
      for (const amortMonths of gridCfg.amorts) {
        for (const rentScenario of rentScenarios) {
          bins.push({
            downPct,
            rateBps: rate,
            amortMonths,
            rentScenario,
          });
        }
      }
    }
  }

  return bins;
}

/**
 * Pre-fetch all annuity factors needed for grid computation
 * @param bins All bin combinations
 * @param factorsRepo Repository for mortgage factors
 * @returns Map of rate-amort keys to annuity factors
 */
async function prefetchAnnuityFactors(
  bins: Array<{ rateBps: number; amortMonths: number; [key: string]: any }>,
  factorsRepo: FactorsPort
): Promise<Map<string, number>> {
  const afCache = new Map<string, number>();
  const uniqueCombos = new Set<string>();

  // Find all unique rate/amort combinations
  for (const bin of bins) {
    const key = `${bin.rateBps}-${bin.amortMonths}`;
    uniqueCombos.add(key);
  }

  // Fetch all annuity factors
  const promises = Array.from(uniqueCombos).map(async (key) => {
    const [rateBps, amortMonths] = key.split("-").map(Number);
    const af = await factorsRepo.getAF(rateBps, amortMonths);
    afCache.set(key, af);
  });

  await Promise.all(promises);
  return afCache;
}

/**
 * Get a specific grid row if it exists
 * @param listingId Listing ID
 * @param listingVersion Listing version
 * @param rentScenario Rent scenario
 * @param downPctBin Down payment bin
 * @param rateBpsBin Rate bin
 * @param amortMonths Amortization months
 * @param uwRepo Repository for reading grid data
 * @returns Grid row if found, null otherwise
 */
export async function getGridRow(
  listingId: string,
  listingVersion: number,
  rentScenario: "P25" | "P50" | "P75",
  downPctBin: number,
  rateBpsBin: number,
  amortMonths: number,
  uwRepo: UWRepoPort
): Promise<GridRow | null> {
  return uwRepo.getGridRow(
    listingId,
    listingVersion,
    rentScenario,
    downPctBin,
    rateBpsBin,
    amortMonths
  );
}

/**
 * Check if grid computation is needed for a listing
 * This can be used to optimize recomputation
 * @param listingId Listing ID
 * @param listingVersion Current listing version
 * @param uwRepo Repository for checking existing data
 * @returns True if grid needs to be computed
 */
export async function needsGridComputation(
  listingId: string,
  listingVersion: number,
  uwRepo: UWRepoPort
): Promise<boolean> {
  // Check if we have any grid rows for this listing version
  // For simplicity, just check one combination - in practice might check a few
  const sampleRow = await uwRepo.getGridRow(
    listingId,
    listingVersion,
    "P50",
    0.2, // 20% down
    500, // 5% rate
    360 // 30 year
  );

  return sampleRow === null;
}
