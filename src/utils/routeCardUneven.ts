import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { shouldShowTrunkSummary } from './routeCardTrunk';
import { rowTrips } from './rowTrips';
import { MIN_UNSUSTAINED_EXCESS_MINUTES, MIN_UNSUSTAINED_RATIO } from '../../shared/unevenGap';

interface DirectionGroupLike {
  realTier: ShapeProperties[];
}

// The pipeline's thresholds, from one shared place (CIV-996).
const UNEVEN_GAP_MIN_EXCESS_MINUTES = MIN_UNSUSTAINED_EXCESS_MINUTES;
const UNEVEN_GAP_MIN_RATIO = MIN_UNSUSTAINED_RATIO;

/**
 * Is this direction's worst gap for the period materially worse than its own normal headway?
 *
 * headwayByPeriodSustained alone isn't enough to gate on: it also goes false when a route's
 * first/last departure simply lands a normal amount inside the period window (e.g. service
 * starting at 7:12 instead of 6:00) -- not a real gap between buses, just when service starts.
 * That case can't be told apart from a real gap by the flag alone, but maxGapByPeriod only ever
 * measures gaps between actual departures, never a window-edge void -- so re-checking maxGap
 * against the route's own headway here filters out the edge-only false positives (#441-adjacent).
 */
export function isRiderMeaningfulGap(
  maxGap: number,
  headway: number | null | undefined,
  minExcessMinutes = UNEVEN_GAP_MIN_EXCESS_MINUTES,
  minRatio = UNEVEN_GAP_MIN_RATIO,
): boolean {
  if (!headway || headway <= 0 || maxGap <= 0) return false;
  return (maxGap - headway >= minExcessMinutes) && (maxGap / headway >= minRatio);
}

/**
 * Find the largest rider-relevant gap for a route card period.
 *
 * A branch's own max gap is not a route-level warning when another branch shares
 * its trunk and supplies regular combined service (#381).
 */
export function unevenPeriodMaxGap(
  directionGroups: readonly DirectionGroupLike[],
  period: TimePeriod,
): number {
  if (period === 'all') return 0;

  const combinedGroups = directionGroups.filter(group => shouldShowTrunkSummary(group.realTier, period));
  return Math.max(0, ...directionGroups.flatMap(group => {
    if (combinedGroups.includes(group)) return [];
    const primaryHw = Math.min(
      ...group.realTier
        .map(d => d.headway)
        .filter((h): h is number => h != null),
    );
    return group.realTier
      .filter(direction => {
        if (direction.headwayByPeriodSustained?.[period] !== false) return false;
        if (primaryHw === Infinity) return true;
        // Keep primary / near-primary; drop branches clearly sparser short-turns.
        return direction.headway == null || direction.headway <= primaryHw * 1.5;
      })
      // The gap of the trips the row's value reads (CIV-1069): a stretch row shared with another headsign reads the
      // stretch's gap, not one headsign's (CIV-939, Sun Metro 205); a row with no service of its own has none.
      .map(direction => ({ direction, trips: rowTrips(direction, period) }))
      .filter(({ direction, trips }) => trips.longestGap != null && isRiderMeaningfulGap(
        trips.longestGap,
        trips.value ?? direction.headway,
      ))
      .map(({ trips }) => trips.longestGap ?? 0);
  }));
}
