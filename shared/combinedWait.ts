/**
 * Branches that share a stretch, each every h_i minutes, together run every 1 / Σ(1/h_i): the Combined row, the hour
 * chart's stack and the map's shared segment all read this (CIV-2976 F3: it was written three times). Whole minutes,
 * at least 1; null when the waits add up to no service. Callers decide which waits count.
 */
export function combinedWait(waits: readonly number[]): number | null {
  const perMinute = waits.reduce((sum, wait) => sum + 1 / wait, 0);
  return perMinute > 0 ? Math.max(1, Math.round(1 / perMinute)) : null;
}
