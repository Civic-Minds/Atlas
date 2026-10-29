/**
 * CIV-1011 #6: whether a stop time is a departure a rider can take, written once. A stop time with
 * pickup_type 1 only drops off (a layover a trip starts from, a terminal it ends at), so it never
 * counts as a departure: it does not pool, does not mark the stop boardable, does not grade the
 * stop and does not settle the tier (#879). Every pipeline step that asks "does this stop time
 * board" calls this.
 */
export function boardsAt(stopTime: { pickup_type?: string | null }): boolean {
  return stopTime.pickup_type?.trim() !== '1';
}

/** A pool whose other patterns add fewer departures than this in a period says nothing the own pattern does not. */
export const MIN_POOL_OTHER_DEPARTURES = 3;

/**
 * CIV-1071: departures the other patterns add to a stop's pooled list in [start, end]: the merged
 * list less the own list, counting repeated times one for one.
 */
export function otherPatternDepartures(merged: readonly number[], own: readonly number[], start: number, end: number): number {
  const ownCounts = new Map<number, number>();
  for (const t of own) if (t >= start && t <= end) ownCounts.set(t, (ownCounts.get(t) ?? 0) + 1);
  let n = 0;
  for (const t of merged) {
    if (t < start || t > end) continue;
    const c = ownCounts.get(t) ?? 0;
    if (c > 0) ownCounts.set(t, c - 1); else n++;
  }
  return n;
}

/**
 * CIV-1071: the pool is thin in the period (its other patterns add under MIN_POOL_OTHER_DEPARTURES
 * departures), so where the pooled value was refused the stop's merged value is kept as the thin-pool
 * fallback. Callers pass both lists already mapped for the period's cross-midnight window.
 */
export function isThinPool(merged: readonly number[], own: readonly number[], start: number, end: number): boolean {
  return otherPatternDepartures(merged, own, start, end) < MIN_POOL_OTHER_DEPARTURES;
}
