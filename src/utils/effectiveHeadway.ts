import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';

type HeadwayProps = ShapeProperties & {
  minStopHeadwayByPeriod?: Partial<Record<string, number>>;
  worstDirectionHeadwayByPeriod?: Partial<Record<string, number>>;
  headwayByPeriod?: Partial<Record<string, number>>;
  worstDirectionHeadway?: number;
  minStopHeadway?: number;
};

/** Headway for display/filtering — mirrors passesRouteFilter period + all-day fallback. */
export function effectiveRouteHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  const ext = p as HeadwayProps;

  if (period !== 'all') {
    const periodHw =
      ext.minStopHeadwayByPeriod?.[period]
      ?? ext.worstDirectionHeadwayByPeriod?.[period]
      ?? ext.headwayByPeriod?.[period];
    if (periodHw != null) return periodHw;
  }

  if (ext.worstDirectionHeadway != null) return ext.worstDirectionHeadway;
  if (ext.minStopHeadway != null) return ext.minStopHeadway;
  return p.headway ?? null;
}
