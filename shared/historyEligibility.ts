/** Minimum distinct snapshot years for Explore (deep archive / long-form history). */
export const MIN_HISTORY_DISTINCT_YEARS = 10;

/**
 * Minimum snapshots on at least one route for Recent.
 * Covers short refresh series (including multiple snapshots in the same calendar year).
 */
export const MIN_HISTORY_RECENT_SNAPSHOTS = 2;

export type HistorySnapshot = { year?: number; label?: string };
export type HistoryRoute = { snapshots?: HistorySnapshot[] };
export type HistoryAgencyLike = { routes?: HistoryRoute[]; coverageYears?: number[] };

/** 'explore' = deep multi-year archive; 'recent' = shorter refresh series. */
export type HistoryTier = 'explore' | 'recent';

/** Distinct calendar years covered by route snapshots or lightweight coverage metadata. */
export function distinctSnapshotYears(agency: HistoryAgencyLike): number[] {
  const years = new Set<number>(agency.coverageYears ?? []);
  for (const route of agency.routes ?? []) {
    for (const snap of route.snapshots ?? []) {
      if (snap.year != null) years.add(snap.year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

/** Longest snapshot chain on any route (refresh cadence, not just calendar years). */
export function maxRouteSnapshotCount(agency: HistoryAgencyLike): number {
  let max = 0;
  for (const route of agency.routes ?? []) {
    const n = route.snapshots?.length ?? 0;
    if (n > max) max = n;
  }
  return max;
}

/**
 * History eligibility tier, or null if the agency should not appear in History.
 * Explore keeps the intentional ≥10-year bar; Recent unlocks shorter usable series.
 */
export function agencyHistoryTier(agency: HistoryAgencyLike): HistoryTier | null {
  if (distinctSnapshotYears(agency).length >= MIN_HISTORY_DISTINCT_YEARS) return 'explore';
  if (maxRouteSnapshotCount(agency) >= MIN_HISTORY_RECENT_SNAPSHOTS) return 'recent';
  return null;
}

/** Deep backfill bar (≥10 distinct snapshot years). */
export function agencyQualifiesForHistoryExplore(agency: HistoryAgencyLike): boolean {
  return agencyHistoryTier(agency) === 'explore';
}

/** Shorter series (≥2 snapshots on a route) that is not Explore. */
export function agencyQualifiesForHistoryRecent(agency: HistoryAgencyLike): boolean {
  return agencyHistoryTier(agency) === 'recent';
}

/** Any History-eligible agency (Explore or Recent). */
export function agencyQualifiesForHistory(agency: HistoryAgencyLike): boolean {
  return agencyHistoryTier(agency) != null;
}

export function historyTierLabel(tier: HistoryTier): string {
  return tier === 'explore' ? 'Explore' : 'Recent';
}
