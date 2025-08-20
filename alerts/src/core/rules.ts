import { SavedSearch, ListingSnapshot, UWMetrics } from "./dto";

export function filterMatches(s: SavedSearch, snap: ListingSnapshot): boolean {
  const f = s.filter;
  if (f.city && f.city.toLowerCase() !== snap.city.toLowerCase()) return false;
  if (f.province && f.province !== snap.province) return false;
  if (f.propertyType && f.propertyType !== snap.propertyType) return false;
  if (f.minBeds && snap.beds < f.minBeds) return false;
  if (f.maxPrice && snap.price > f.maxPrice) return false;
  return true;
}

export function thresholdsPass(s: SavedSearch, m: UWMetrics|undefined, score: number|undefined): { ok: boolean; matched: string[] } {
  const out: string[] = [];
  const t = s.thresholds || {};
  if (t.minScore !== undefined) {
    if (score === undefined || score < t.minScore) return { ok: false, matched: out };
    out.push(`score>=${t.minScore}`);
  }
  if (m) {
    if (t.minDSCR !== undefined) {
      if (!m.dscr || m.dscr < t.minDSCR) return { ok: false, matched: out };
      out.push(`dscr>=${t.minDSCR}`);
    }
    if (t.minCoC !== undefined) {
      if (!m.cashOnCashPct || m.cashOnCashPct < t.minCoC) return { ok: false, matched: out };
      out.push(`coc>=${t.minCoC}`);
    }
    if (t.minCapRate !== undefined) {
      if (!m.capRatePct || m.capRatePct < t.minCapRate) return { ok: false, matched: out };
      out.push(`cap>=${t.minCapRate}`);
    }
    if (t.requireNonNegativeCF) {
      if ((m.cashFlowAnnual ?? -1) < 0) return { ok: false, matched: out };
      out.push(`cf>=0`);
    }
  }
  return { ok: true, matched: out };
}
