import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { shouldShowTrunkSummary } from './routeCardTrunk';

interface DirectionGroupLike {
  realTier: ShapeProperties[];
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
      .map(direction => direction.maxGapByPeriod?.[period] ?? 0);
  }));
}
