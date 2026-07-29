/** Minimum distinct snapshot years for an agency to appear in History and info counts. */
export const MIN_HISTORY_DISTINCT_YEARS = 10;

export type HistorySnapshot = { year?: number };
export type HistoryRoute = { snapshots?: HistorySnapshot[] };
export type HistoryAgencyLike = { routes?: HistoryRoute[]; coverageYears?: number[] };

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

/** History app + info badges: deep backfill bar (≥10 distinct snapshot years). */
export function agencyQualifiesForHistoryExplore(agency: HistoryAgencyLike): boolean {
  return distinctSnapshotYears(agency).length >= MIN_HISTORY_DISTINCT_YEARS;
}
