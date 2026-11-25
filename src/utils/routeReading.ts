/**
 * CIV-2953 (route reading step 1, CIV-2951's map): one place every reader takes a route's frequency reading for a period
 * from, with its reason. It is built from the functions each reader already called, with no rule of its own, so no
 * shown value changes (proven zero-diff across a release with tmp/civ2951's scan). Readers: the MCP's route_frequency,
 * agency pages and schedule_changes; the app's list and card keep calling the same functions it is made of.
 *
 * - `filter`: the map's grade (routeFilterReading): the number the frequency filter and the map colour compare.
 * - `filterDisplay`: the filter's number with its range low end and edge words (routeListFilterDisplay); `wait` is its
 *   number as the MCP's waitMinutes and schedule_changes give it (routeWaitMinutes).
 * - `list`: the route list's reading, the card's own lowest and highest numbers and words (routeListDisplay); `text` is
 *   its words (routeListCellText).
 */
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { PeriodKey } from '../../shared/config';
import { routeFilterReading, type RouteFilterReading } from '../../shared/routeHeadwayFilter';
import { routeListCellText, routeListDisplay, routeListFilterDisplay, routeWaitMinutes, type RouteListDisplay } from './effectiveHeadway';

export interface RouteReading {
  filter: RouteFilterReading;
  filterDisplay: RouteListDisplay;
  wait: number | null;
  list: RouteListDisplay;
  /** The list's words; `compact` gives the tight-spot form (agency pages). */
  text(compact?: boolean): string | null;
}

/** A route's reading for a period, from its direction and branch rows (one route, one day). */
export function routeReading(rows: readonly ShapeProperties[], period: TimePeriod): RouteReading {
  const filterDisplay = routeListFilterDisplay(rows, period);
  const list = routeListDisplay(rows, period);
  return {
    filter: period === 'all' ? { wait: filterDisplay.headway, breaks: 0 } : routeFilterReading(rows, period as PeriodKey),
    filterDisplay,
    wait: routeWaitMinutes(filterDisplay),
    list,
    text: (compact = false) => routeListCellText(list, compact),
  };
}
