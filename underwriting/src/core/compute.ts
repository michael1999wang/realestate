import { Metrics } from "./dto";

/**
 * Compute a score from metrics (optional feature)
 * This is a placeholder implementation - actual scoring logic would depend on business requirements
 * @param metrics Computed investment metrics
 * @returns Numerical score (higher = better investment)
 */
export function scoreFromMetrics(metrics: Metrics): number {
  // Example scoring algorithm - weight different factors
  let score = 0;

  // Cap rate contribution (0-40 points)
  const capRateScore = Math.min(40, Math.max(0, metrics.capRatePct * 8));
  score += capRateScore;

  // Cash-on-cash contribution (0-30 points)
  const cocScore = Math.min(30, Math.max(0, metrics.cashOnCashPct * 3));
  score += cocScore;

  // DSCR contribution (0-20 points)
  const dscrScore = Math.min(20, Math.max(0, (metrics.dscr - 1) * 40));
  score += dscrScore;

  // Cash flow contribution (0-10 points)
  const cfScore = Math.min(10, Math.max(0, metrics.cashFlowAnnual / 1000));
  score += cfScore;

  return Math.round(score * 100) / 100; // Round to 2 decimal places
}

/**
 * Categorize investment quality based on metrics
 * @param metrics Computed investment metrics
 * @returns Investment category
 */
export function categorizeInvestment(
  metrics: Metrics
): "excellent" | "good" | "fair" | "poor" {
  const score = scoreFromMetrics(metrics);

  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

/**
 * Generate investment summary text
 * @param metrics Computed investment metrics
 * @returns Human-readable summary
 */
export function generateInvestmentSummary(metrics: Metrics): string {
  const category = categorizeInvestment(metrics);
  const score = scoreFromMetrics(metrics);

  const parts = [
    `Investment Score: ${score}/100 (${category})`,
    `Cap Rate: ${metrics.capRatePct.toFixed(2)}%`,
    `Cash-on-Cash: ${metrics.cashOnCashPct.toFixed(2)}%`,
    `DSCR: ${metrics.dscr.toFixed(2)}`,
    `Annual Cash Flow: $${metrics.cashFlowAnnual.toLocaleString()}`,
  ];

  if (metrics.irrPct) {
    parts.push(`IRR: ${metrics.irrPct.toFixed(2)}%`);
  }

  return parts.join(" | ");
}

/**
 * Compare two sets of metrics
 * @param metrics1 First metrics set
 * @param metrics2 Second metrics set
 * @returns Comparison object showing differences
 */
export function compareMetrics(
  metrics1: Metrics,
  metrics2: Metrics
): {
  capRateDiff: number;
  cocDiff: number;
  dscrDiff: number;
  cashFlowDiff: number;
  scoreDiff: number;
  betterOption: 1 | 2 | "tie";
} {
  const score1 = scoreFromMetrics(metrics1);
  const score2 = scoreFromMetrics(metrics2);

  return {
    capRateDiff: metrics2.capRatePct - metrics1.capRatePct,
    cocDiff: metrics2.cashOnCashPct - metrics1.cashOnCashPct,
    dscrDiff: metrics2.dscr - metrics1.dscr,
    cashFlowDiff: metrics2.cashFlowAnnual - metrics1.cashFlowAnnual,
    scoreDiff: score2 - score1,
    betterOption: score1 > score2 ? 1 : score2 > score1 ? 2 : "tie",
  };
}
