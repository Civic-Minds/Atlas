/**
 * CIV-238 (Ryan, 2026-11-19: "1"): the wait from a period's start to its first bus, and from its last bus to the period's
 * end, counts like any other gap between buses, under the settled near-miss allowance (FREQUENCY_RULES table A). A true
 * start or end of service (no bus on the other side of the boundary all day) keeps the approved 10 minutes over the
 * grade, using one near-miss slot (DECISIONS: "one 10-minute allowance per true service edge"). It replaces the
 * 60-minute / 8x edge allowance (33758d8b, never approved). Night Service keeps its own 60 (CIV-1198) and is not read here.
 *
 * Returns a bit mask over PUBLIC_TIER_MAXES: bit i is set when the stretch's gaps between buses pass grade
 * PUBLIC_TIER_MAXES[i] on their own but the period fails it once its edge waits count. The filter fails a route at that
 * grade (shared/tileFilterExprs.ts); the route's own numbers are unchanged.
 */
import { EDGE_GAP_ALLOWANCE_MINUTES, GRACE_MINUTES, GRACE_PERCENT, PUBLIC_TIER_MAXES, VIOLATION_PERCENT, VIOLATION_PERCENT_BY_TIER } from '../shared/rules/frequency.js';
import { determineTier } from './transit-phase2.js';

/** `times`: the stretch's departures (minutes, sorted, the day's whole list); [start, end): the period window. */
export function edgeWaitFailMask(times: readonly number[], start: number, end: number): number {
  const t = times.filter(x => x >= start && x < end);
  if (t.length === 0) return 0;
  const internal = t.slice(1).map((x, i) => x - t[i]);
  const open = t[0] - start;
  const close = end - t[t.length - 1];
  const trueOpen = !times.some(x => x < start);
  const trueClose = !times.some(x => x >= end);
  const passes = (gaps: number[], n: number, edgeSlots: number) =>
    determineTier(gaps, t.length, 0, [n], GRACE_MINUTES, 0, GRACE_PERCENT, VIOLATION_PERCENT, VIOLATION_PERCENT_BY_TIER as Record<number, number>, edgeSlots) === String(n);
  let mask = 0;
  PUBLIC_TIER_MAXES.forEach((n, bit) => {
    if (!passes(internal, n, 0)) return;
    const grace = Math.max(GRACE_MINUTES, Math.round(n * GRACE_PERCENT));
    const gaps = [...internal];
    let slots = 0;
    let hard = false;
    for (const [wait, isTrue] of [[open, trueOpen], [close, trueClose]] as const) {
      if (wait <= 0) continue;
      if (!isTrue || wait <= n + grace) gaps.push(wait);
      else if (wait <= n + EDGE_GAP_ALLOWANCE_MINUTES) slots++;
      else hard = true;
    }
    if (hard || !passes(gaps, n, slots)) mask |= 1 << bit;
  });
  return mask;
}
