import { SavedSearch, ListingSnapshot, UWMetrics } from "./dto";
import { filterMatches, thresholdsPass } from "./rules";

export function matchSearches(
  listing: ListingSnapshot,
  searches: SavedSearch[],
  metrics?: UWMetrics,
  score?: number
) {
  const winners: { search: SavedSearch; matched: string[] }[] = [];
  for (const s of searches) {
    if (!s.isActive) continue;
    if (!filterMatches(s, listing)) continue;
    const { ok, matched } = thresholdsPass(s, metrics, score);
    if (ok) winners.push({ search: s, matched });
  }
  return winners;
}
