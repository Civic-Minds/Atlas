import { TIME_PERIODS } from '../../shared/config';
import type { HeadwayByPeriod } from '../hooks/useAgencyData';
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildRouteServiceSummary } from './routeFacts';

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
  const display = buildRouteServiceSummary(p).display;
  if (period !== 'all') {
    const ph = display.byPeriod?.[period as keyof HeadwayByPeriod]
      ?? periodHeadwayFromByHour(display.byHour, period);
    if (ph != null) return ph;
  }
  return display.value;
}

/** Headway for display/filtering — mirrors passesRouteFilter period + all-day fallback. */
export function effectiveRouteHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  const service = buildRouteServiceSummary(p);

  if (period !== 'all') {
    const periodHw = service.filter.byPeriod?.[period]
      ?? (service.filter.byHour ? periodHeadwayFromByHour(service.filter.byHour, period) : null);
    if (periodHw != null) return periodHw;
  }
  return service.filter.value;
}
