/** Minimum distinct snapshot years before an agency is shown in public History. */
export const MIN_HISTORY_DISTINCT_YEARS = 10;

export type HistorySnapshot = { year?: number; label?: string };
export type HistoryRoute = { snapshots?: HistorySnapshot[] };
/** `coverageYears` may still be present on published data; eligibility ignores it. */
export type HistoryAgencyLike = { routes?: HistoryRoute[]; coverageYears?: number[] };

export type HistoryTier = 'explore';

/**
 * Distinct real snapshot years, none after the build year. Coverage metadata
 * (`coverageYears`) is ignored: a year only counts when a route has a snapshot for it.
 */
export function distinctSnapshotYears(agency: HistoryAgencyLike, buildYear: number = new Date().getFullYear()): number[] {
  const years = new Set<number>();
  for (const route of agency.routes ?? []) {
    for (const snap of route.snapshots ?? []) {
      if (snap.year != null && Number.isInteger(snap.year) && snap.year <= buildYear) years.add(snap.year);
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

/** Committed list of History-eligible agency slugs (shared/data/history-agencies.json). */
export interface HistoryAgencyList {
  /** Distinct-year bar the list was built with (MIN_HISTORY_DISTINCT_YEARS). */
  minYears: number;
  slugs: string[];
}

/** The small committed list the UI reads instead of the full history-config.json. */
export function buildHistoryAgencyList(rows: ReadonlyArray<HistoryAgencyLike & { slug: string }>): HistoryAgencyList {
  return {
    minYears: MIN_HISTORY_DISTINCT_YEARS,
    slugs: rows.filter(agencyQualifiesForHistory).map(a => a.slug).sort(),
  };
}
