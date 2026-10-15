/**
 * The service pattern a route card names for part-time and one-off routes (#720): "Rush hour
 * only", "Evenings only", "Some days only" or "A few trips a day". Regular all-day routes get no
 * name. Exact day names ("Thu-Fri nights") need a pipeline field and come later.
 */
import { PERIOD_KEYS, type PeriodKey } from '../../shared/config';
import { isIrregularService, isLimitedService } from '../../shared/irregularRoutes';
import type { ShapeProperties } from '../hooks/useIntervalStats';

export type RoutePatternLabel = 'Rush hour only' | 'Evenings only' | 'Some days only' | 'A few trips a day';

const RUSH: ReadonlySet<PeriodKey> = new Set(['amPeak', 'pmPeak']);
const EVENING: ReadonlySet<PeriodKey> = new Set(['evening', 'late', 'overnight']);
/**
 * Rush-hour windows by hour of departure: the 6-9 and 15-19 peaks with an hour either side, since
 * a peak run's first or last trip often falls just outside (SF 8BX's last morning trip at 09:04).
 */
const RUSH_HOURS: ReadonlySet<number> = new Set([5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19]);
const EVENING_FROM_HOUR = 19;

/** Hours (GTFS, may pass 24) with a reading in any of these directions, or null without hourly data. */
function hoursWithService(directions: readonly ShapeProperties[]): Set<number> | null {
  const hours = new Set<number>();
  let any = false;
  for (const d of directions) {
    if (!d.headwayByHour) continue;
    any = true;
    for (const [h, v] of Object.entries(d.headwayByHour)) if (v != null) hours.add(Number(h));
  }
  return any ? hours : null;
}

/** Periods in which any of these directions runs, from their period headways or coverage. */
function periodsWithService(directions: readonly ShapeProperties[]): Set<PeriodKey> {
  const periods = new Set<PeriodKey>();
  for (const d of directions) {
    for (const key of PERIOD_KEYS) {
      if (d.headwayByPeriod?.[key] != null || d.periodCoverageHeadway?.[key] != null) periods.add(key);
    }
  }
  return periods;
}

const within = <T,>(values: Set<T>, allowed: (v: T) => boolean) => values.size > 0 && [...values].every(allowed);

export function routePatternLabel(directions: readonly ShapeProperties[]): RoutePatternLabel | null {
  if (directions.length === 0) return null;
  const limited = directions.some(d => isLimitedService(d));
  const irregular = directions.every(d => isIrregularService(d));
  if (!limited && !irregular) return null;
  if (directions.some(d => d.partialWeekdayServiceByPeriod != null)) return 'Some days only';
  const hours = hoursWithService(directions);
  if (hours && hours.size > 0) {
    if (within(hours, h => RUSH_HOURS.has(h))) return 'Rush hour only';
    if (within(hours, h => h >= EVENING_FROM_HOUR)) return 'Evenings only';
  } else {
    const periods = periodsWithService(directions);
    if (within(periods, p => RUSH.has(p))) return 'Rush hour only';
    if (within(periods, p => EVENING.has(p))) return 'Evenings only';
  }
  return irregular ? 'A few trips a day' : null;
}
