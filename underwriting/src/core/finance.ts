import { Assumptions, BaseInputs, Metrics, Money } from "./dto";

/**
 * Calculate annuity factor for mortgage payments
 * AF = r * (1+r)^n / ((1+r)^n - 1) where r is monthly rate, n is number of months
 * @param rateBps Interest rate in basis points (e.g., 500 = 5.00%)
 * @param amortMonths Amortization period in months
 * @returns Monthly annuity factor
 */
export function annuityFactor(rateBps: number, amortMonths: number): number {
  if (rateBps === 0) {
    return 1 / amortMonths; // Special case for 0% interest
  }

  const monthlyRate = rateBps / 10000 / 12;
  const factor = Math.pow(1 + monthlyRate, amortMonths);

  return (monthlyRate * factor) / (factor - 1);
}

/**
 * Calculate monthly payment from loan amount and annuity factor
 * @param loan Loan amount
 * @param af Annuity factor
 * @returns Monthly payment amount
 */
export function paymentFromAF(loan: number, af: number): number {
  return loan * af;
}

/**
 * Select NOI based on rent scenario
 * @param base Base inputs containing P25, P50, P75 NOI values
 * @param scenario Which scenario to use
 * @returns Selected NOI value
 */
function selectNOI(base: BaseInputs, scenario: "P25" | "P50" | "P75"): Money {
  switch (scenario) {
    case "P25":
      return base.noiP25;
    case "P50":
      return base.noiP50;
    case "P75":
      return base.noiP75;
    default:
      return base.noiP50;
  }
}

/**
 * Calculate breakeven occupancy percentage
 * This is a simplified calculation - in practice you'd need GPR and vacancy data
 * @param dsAnnual Annual debt service
 * @param noi Net operating income
 * @returns Breakeven occupancy percentage
 */
function calculateBreakevenOccupancy(dsAnnual: Money, noi: Money): number {
  if (noi === 0) return 100;
  return Math.min(100, (dsAnnual / noi) * 100);
}

/**
 * Calculate investment metrics from base inputs and assumptions
 * @param base Base property and financial inputs
 * @param assumptions Investment assumptions
 * @param af Pre-calculated annuity factor
 * @returns Complete metrics object
 */
export function computeMetrics(
  base: BaseInputs,
  assumptions: Assumptions,
  af: number
): Metrics {
  // Select NOI based on scenario
  const noi = selectNOI(base, assumptions.rentScenario);

  // Apply optional management percentage
  const adjustedNOI = assumptions.mgmtPct
    ? noi * (1 - assumptions.mgmtPct)
    : noi;

  // Apply optional reserves
  const finalNOI = assumptions.reservesMonthly
    ? adjustedNOI - assumptions.reservesMonthly * 12
    : adjustedNOI;

  // Calculate loan and payments
  const downPayment = base.price * assumptions.downPct;
  const loan = base.price - downPayment;
  const monthlyPayment = paymentFromAF(loan, af);
  const dsAnnual = monthlyPayment * 12;

  // Calculate key metrics
  const capRatePct = (finalNOI / base.price) * 100;
  const cashFlowAnnual = finalNOI - dsAnnual;
  const totalCashInvested = downPayment + base.closingCosts;
  const cashOnCashPct =
    totalCashInvested > 0 ? (cashFlowAnnual / totalCashInvested) * 100 : 0;
  const dscr = dsAnnual > 0 ? finalNOI / dsAnnual : 0;
  const breakevenOccPct = calculateBreakevenOccupancy(dsAnnual, finalNOI);

  // Optional IRR calculation (placeholder for now)
  let irrPct: number | undefined;
  if (
    assumptions.exitCapPct &&
    assumptions.holdYears &&
    assumptions.growthRentPct
  ) {
    // IRR calculation would go here - simplified for now
    irrPct = undefined; // TODO: Implement IRR calculation
  }

  return {
    price: base.price,
    noi: finalNOI,
    capRatePct,
    loan,
    dsAnnual,
    cashFlowAnnual,
    dscr,
    cashOnCashPct,
    breakevenOccPct,
    irrPct,
    inputs: assumptions,
  };
}

/**
 * Validate assumptions are within reasonable bounds
 * @param assumptions Assumptions to validate
 * @throws Error if assumptions are invalid
 */
export function validateAssumptions(assumptions: Assumptions): void {
  if (assumptions.downPct < 0.05 || assumptions.downPct > 0.35) {
    throw new Error(
      `Down payment percentage ${assumptions.downPct} is outside valid range (0.05-0.35)`
    );
  }

  if (assumptions.rateBps < 100 || assumptions.rateBps > 2000) {
    throw new Error(
      `Interest rate ${assumptions.rateBps} bps is outside valid range (100-2000)`
    );
  }

  if (![240, 300, 360].includes(assumptions.amortMonths)) {
    throw new Error(
      `Amortization period ${assumptions.amortMonths} is not supported (240, 300, 360)`
    );
  }

  if (!["P25", "P50", "P75"].includes(assumptions.rentScenario)) {
    throw new Error(
      `Rent scenario ${assumptions.rentScenario} is not valid (P25, P50, P75)`
    );
  }

  if (
    assumptions.mgmtPct &&
    (assumptions.mgmtPct < 0 || assumptions.mgmtPct > 0.5)
  ) {
    throw new Error(
      `Management percentage ${assumptions.mgmtPct} is outside valid range (0-0.5)`
    );
  }
}
