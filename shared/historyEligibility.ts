/** Minimum distinct snapshot years before an agency is shown in public History. */
export const MIN_HISTORY_DISTINCT_YEARS = 10;

export type HistorySnapshot = { year?: number; label?: string };
export type HistoryRoute = { snapshots?: HistorySnapshot[] };
export type HistoryAgencyLike = { routes?: HistoryRoute[]; coverageYears?: number[] };

export type HistoryTier = 'explore';

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

/**
 * History eligibility tier, or null if the agency should not appear in History.
 */
export function agencyHistoryTier(agency: HistoryAgencyLike): HistoryTier | null {
  return distinctSnapshotYears(agency).length >= MIN_HISTORY_DISTINCT_YEARS ? 'explore' : null;
}

/** Public History bar (≥10 distinct snapshot years). */
export function agencyQualifiesForHistoryExplore(agency: HistoryAgencyLike): boolean {
  return agencyHistoryTier(agency) === 'explore';
}

export function agencyQualifiesForHistory(agency: HistoryAgencyLike): boolean {
  return agencyQualifiesForHistoryExplore(agency);
}
