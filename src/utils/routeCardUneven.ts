import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { shouldShowTrunkSummary } from './routeCardTrunk';

interface DirectionGroupLike {
  realTier: ShapeProperties[];
  /** Every feature of the direction, when its rows come from the stretches (CIV-939). */
  directionFeatures?: readonly ShapeProperties[];
}

// Mirrors pipeline/headway-utils.ts's MIN_UNSUSTAINED_EXCESS_MINUTES / MIN_UNSUSTAINED_RATIO.
// Duplicated rather than imported -- pipeline/ isn't part of the frontend build. Keep in sync
// if the pipeline constants are retuned.
const UNEVEN_GAP_MIN_EXCESS_MINUTES = 15;
const UNEVEN_GAP_MIN_RATIO = 1.7;

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
 * CIV-939: another main or tail feature fills the same stretch slot under a different headsign and has a headway in the period. The
 * pipeline measures a feature's period gaps over its own headsign's trips, so this feature's longest gap leaves those trips out
 * (Sun Metro 205: 9 "Mesa Inbound" trips of 58 read a 315-minute midday gap while the direction runs every 18).
 */
export function stretchSlotSharedWithOtherHeadsign(
  f: ShapeProperties,
  directionFeatures: readonly ShapeProperties[],
  period: TimePeriod,
): boolean {
  if (period === 'all' || (f.stretchRole !== 'main' && f.stretchRole !== 'tail')) return false;
  const headsign = (f.headsign ?? '').trim();
  return directionFeatures.some(o => o !== f
    && o.stretchRole === f.stretchRole
    && (o.stretchIndex ?? 0) === (f.stretchIndex ?? 0)
    && (o.headsign ?? '').trim() !== headsign
    // A period headway needs departures inside the window; a gap alone can be the whole window between two outside it.
    && o.headwayByPeriod?.[period] != null);
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
      // A row whose stretch another headsign shares: its own gap leaves those trips out (CIV-939).
      .filter(direction => !group.directionFeatures || !stretchSlotSharedWithOtherHeadsign(direction, group.directionFeatures, period))
      .filter(direction => isRiderMeaningfulGap(
        direction.maxGapByPeriod?.[period] ?? 0,
        direction.headwayByPeriod?.[period] ?? direction.headway,
      ))
      .map(direction => direction.maxGapByPeriod?.[period] ?? 0);
  }));
}
