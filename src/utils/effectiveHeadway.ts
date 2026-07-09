import { TIME_PERIODS } from '../../shared/config';
import type { HeadwayByPeriod } from '../hooks/useAgencyData';
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';

type HeadwayProps = ShapeProperties & {
  minStopHeadwayByPeriod?: Partial<Record<string, number>>;
  worstDirectionHeadwayByPeriod?: Partial<Record<string, number>>;
  headwayByPeriod?: Partial<Record<string, number>>;
  headwayByHour?: Partial<Record<number, number | null>>;
  worstDirectionHeadway?: number;
  minStopHeadway?: number;
};

export function periodHeadwayFromByHour(
  byHour: Partial<Record<number, number | null>> | undefined,
  periodKey: string,
): number | null {
  if (!byHour) return null;
  const p = TIME_PERIODS.find(t => t.key === periodKey);
  if (!p) return null;
  let best: number | null = null;
  for (let h = p.startHour; h < p.endHour; h++) {
    const v = byHour[h];
    if (v != null && (best === null || v < best)) best = v;
  }
  return best;
}

/** Headway shown on route card rows and route lists — period summary, not min-stop filter headway. */
export function routeCardDisplayHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  if (period !== 'all') {
    const ext = p as HeadwayProps;
    const ph = ext.headwayByPeriod?.[period as keyof HeadwayByPeriod]
      ?? periodHeadwayFromByHour(ext.headwayByHour, period);
    if (ph != null) return ph;
  }
  return p.headway ?? null;
}

/** Headway for display/filtering — mirrors passesRouteFilter period + all-day fallback. */
export function effectiveRouteHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  const ext = p as HeadwayProps;

  if (period !== 'all') {
    const periodHw =
      ext.minStopHeadwayByPeriod?.[period]
      ?? ext.headwayByPeriod?.[period]
      ?? ext.worstDirectionHeadwayByPeriod?.[period]
      ?? periodHeadwayFromByHour(ext.headwayByHour, period);
    if (periodHw != null) return periodHw;
  }

  if (ext.worstDirectionHeadway != null) return ext.worstDirectionHeadway;
  if (ext.minStopHeadway != null) return ext.minStopHeadway;
  return p.headway ?? null;
}
