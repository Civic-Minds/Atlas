/** Minimum distinct snapshot years before an agency is shown in public History. */
export const MIN_HISTORY_DISTINCT_YEARS = 10;

export type HistorySnapshot = { year?: number; label?: string };
export type HistoryRoute = { snapshots?: HistorySnapshot[] };
export type HistoryAgencyLike = { routes?: HistoryRoute[]; coverageYears?: number[] };

export type HistoryTier = 'explore';

/**
 * Eligibility options. `realYearsOnly` is the History v2 rule and is OFF by default: the
 * published list (and the weekly build) keeps the original rule unless the v2 build asks for
 * it (build-history sets it from ATLAS_HISTORY_V2=1). It is an explicit option, not an env
 * read, because this file also runs in the browser.
 */
export interface HistoryEligibilityOptions {
  /**
   * true: count only real snapshot years, none after `buildYear`, and ignore `coverageYears`.
   * false/omitted: the original rule (snapshot years plus `coverageYears`, any year).
   */
  realYearsOnly?: boolean;
  /** Latest year that counts, under either rule (default: this year). Later years are future-dated and never count. */
  buildYear?: number;
}

/** Distinct calendar years covered by route snapshots or lightweight coverage metadata. */
export function distinctSnapshotYears(agency: HistoryAgencyLike, options: HistoryEligibilityOptions = {}): number[] {
  if (options.realYearsOnly) {
    const buildYear = options.buildYear ?? new Date().getFullYear();
    const real = new Set<number>();
    for (const route of agency.routes ?? []) {
      for (const snap of route.snapshots ?? []) {
        if (snap.year != null && Number.isInteger(snap.year) && snap.year <= buildYear) real.add(snap.year);
      }
    }
    return [...real].sort((a, b) => a - b);
  }
  // A year after the build year cannot be a real past year (a feed that starts later), so it never counts.
  const buildYear = options.buildYear ?? new Date().getFullYear();
  const years = new Set<number>((agency.coverageYears ?? []).filter(y => y <= buildYear));
  for (const route of agency.routes ?? []) {
    for (const snap of route.snapshots ?? []) {
      if (snap.year != null && snap.year <= buildYear) years.add(snap.year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

/**
 * History eligibility tier, or null if the agency should not appear in History.
 */
export function agencyHistoryTier(agency: HistoryAgencyLike, options: HistoryEligibilityOptions = {}): HistoryTier | null {
  return distinctSnapshotYears(agency, options).length >= MIN_HISTORY_DISTINCT_YEARS ? 'explore' : null;
}

/** Public History bar (≥10 distinct snapshot years). */
export function agencyQualifiesForHistoryExplore(agency: HistoryAgencyLike, options: HistoryEligibilityOptions = {}): boolean {
  return agencyHistoryTier(agency, options) === 'explore';
}

export function agencyQualifiesForHistory(agency: HistoryAgencyLike, options: HistoryEligibilityOptions = {}): boolean {
  return agencyQualifiesForHistoryExplore(agency, options);
}

/** Committed list of History-eligible agency slugs (shared/data/history-agencies.json). */
export interface HistoryAgencyList {
  /** Distinct-year bar the list was built with (MIN_HISTORY_DISTINCT_YEARS). */
  minYears: number;
  slugs: string[];
}

/** The small committed list the UI reads instead of the full history-config.json. */
export function buildHistoryAgencyList(rows: ReadonlyArray<HistoryAgencyLike & { slug: string }>, options: HistoryEligibilityOptions = {}): HistoryAgencyList {
  return {
    minYears: MIN_HISTORY_DISTINCT_YEARS,
    slugs: rows.filter(a => agencyQualifiesForHistory(a, options)).map(a => a.slug).sort(),
  };
}
