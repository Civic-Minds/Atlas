/** Minimum distinct snapshot years for an agency to appear in History and info counts. */
export const MIN_HISTORY_DISTINCT_YEARS = 10;

export type HistorySnapshot = { year?: number };
export type HistoryRoute = { snapshots?: HistorySnapshot[] };
export type HistoryAgencyLike = { routes?: HistoryRoute[] };

/** Distinct calendar years present in any route snapshot for this agency. */
export function distinctSnapshotYears(agency: HistoryAgencyLike): number[] {
  const years = new Set<number>();
  for (const route of agency.routes ?? []) {
    for (const snap of route.snapshots ?? []) {
      if (snap.year != null) years.add(snap.year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

/** History app + info badges: deep backfill bar (≥10 distinct snapshot years). */
export function agencyQualifiesForHistoryExplore(agency: HistoryAgencyLike): boolean {
  return distinctSnapshotYears(agency).length >= MIN_HISTORY_DISTINCT_YEARS;
}
