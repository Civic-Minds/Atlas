/**
 * One set of list comparators so every list in Atlas orders the same way.
 *
 * - Route numbers sort naturally ("2" before "10", "7A" before "7B"), ignoring case and accents.
 * - Names sort A-Z ignoring case and accents, so "Île" sits next to "Ile".
 * - Every comparator ends with a strict tie-break, so rows that look equal never swap places
 *   between renders.
 *
 * The locale is pinned to English so the browser, the build scripts and the tests agree.
 */

const looseCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const strictCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' });

type Text = string | null | undefined;

/** A-Z ignoring case and accents, then a strict pass so case/accent twins keep one fixed order. */
export function compareText(a: Text, b: Text): number {
  const x = a ?? '';
  const y = b ?? '';
  return looseCollator.compare(x, y) || strictCollator.compare(x, y);
}

/** Agency (or any display) name, accent- and case-insensitive A-Z. */
export function compareAgencyName(a: Text, b: Text): number {
  return compareText(a, b);
}

/**
 * Route number in natural order ("2" < "10", "7A" < "7B", "7a" = "7A"), then the long name,
 * then a strict pass on both so the order never depends on input order.
 */
export function compareRouteNumber(aShort: Text, bShort: Text, aLong?: Text, bLong?: Text): number {
  const as = aShort ?? '';
  const bs = bShort ?? '';
  const al = aLong ?? '';
  const bl = bLong ?? '';
  return looseCollator.compare(as, bs)
    || looseCollator.compare(al, bl)
    || strictCollator.compare(as, bs)
    || strictCollator.compare(al, bl);
}

/** Region names A-Z, with "Other" always last. */
export function compareRegion(a: string, b: string): number {
  if (a === b) return 0;
  if (a === 'Other') return 1;
  if (b === 'Other') return -1;
  return compareText(a, b);
}

/** Ascending number with null/undefined last. Never subtracts, so Infinity ties are safe. */
export function compareNullableAscending(a: number | null | undefined, b: number | null | undefined): number {
  const aMissing = a == null || Number.isNaN(a);
  const bMissing = b == null || Number.isNaN(b);
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  if (a === b) return 0;
  return a! < b! ? -1 : 1;
}

export interface HeadwaySortable {
  headway: number | null | undefined;
  shortName: Text;
  longName?: Text;
}

/** Most frequent first, routes without a number last, then route number so equal rows never shuffle. */
export function compareHeadwayThenNumber(a: HeadwaySortable, b: HeadwaySortable): number {
  return compareNullableAscending(a.headway, b.headway)
    || compareRouteNumber(a.shortName, b.shortName, a.longName, b.longName);
}

export interface SearchRelevanceKeys {
  inView: boolean;
  /** Lower is a better text match. Lists without match quality leave it out. */
  matchRank?: number;
  distanceM: number;
}

/**
 * Search result order: in view first, then better match, then nearer, then the list's own
 * name/number tie-break.
 */
export function compareSearchRelevance<T extends SearchRelevanceKeys>(
  a: T,
  b: T,
  tieBreak: (a: T, b: T) => number,
): number {
  if (a.inView !== b.inView) return a.inView ? -1 : 1;
  const byMatch = compareNullableAscending(a.matchRank, b.matchRank);
  if (byMatch !== 0) return byMatch;
  const byDistance = compareNullableAscending(a.distanceM, b.distanceM);
  if (byDistance !== 0) return byDistance;
  return tieBreak(a, b);
}
