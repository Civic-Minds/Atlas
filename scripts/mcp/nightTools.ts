/**
 * night_service (CIV-2080, narrowed: late-night frequency by period; routes_by_hours already gives first and last
 * trips): an agency's routes that run through the night, by the Night Service page's own rule and grades
 * (shared/nightService.ts: a departure every 30, 60 or 90 min or better from 2 to 5 AM), with each route's Late and
 * Overnight figures as route_frequency gives them.
 */
import { NIGHT_GRADES, OVERNIGHT_NIGHT_GRADE, type NightServiceFrequency } from '../../shared/nightService';
import { PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { compareRouteNumber } from '../../shared/sortCompare';
import { nightRuleText } from '../../src/content/researchRules';
import { headwayOrBetter } from '../../shared/headwayText';
import * as data from './atlasData';
import { needAgency, SOURCE, validThrough, type Args } from './toolHelpers';

const LATE_PERIODS = ['late', 'overnight'] as const;

export const nightHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  night_service: async (args) => {
    const a = await needAgency(args.agency);
    const day = data.parseDay(args.day);
    const every = (args.every != null ? Number(args.every) : OVERNIGHT_NIGHT_GRADE) as NightServiceFrequency;
    if (!NIGHT_GRADES.includes(every)) throw new Error(`every takes ${NIGHT_GRADES.join(', ')}: the Night Service page's grades.`);
    const list = await data.routeList(a, day);
    if (list.length && list.every(r => r.night === undefined)) {
      return { agency: a.name, day, routes: [], note: "Atlas's published files for this agency don't carry night grades yet. Use routes_at_frequency with period late or overnight instead.", scheduleValidThrough: validThrough(a) };
    }
    const routes = list.filter(r => r.night != null && r.night <= every)
      .sort((x, y) => x.night! - y.night! || compareRouteNumber(x.name, y.name, x.longName, y.longName))
      .map(r => ({
        route: r.name, name: r.longName, night: `${headwayOrBetter(r.night!)} from 2–5 AM`,
        ...Object.fromEntries(LATE_PERIODS.map(k => [k, { hours: r.figures[k].hours, shown: r.figures[k].shown, waitMinutes: r.figures[k].waitMinutes }])),
      }));
    return {
      agency: a.name, day, rule: nightRuleText(every),
      periods: Object.fromEntries(LATE_PERIODS.map(k => [k, `${PERIOD_LABELS[k]} (${formatPeriodRange(k)})`])),
      routesRunningThroughNight: routes.length, routesOnDay: list.length, routes,
      ...(routes.length ? {} : { note: `No ${a.name} route runs ${headwayOrBetter(every)} from 2–5 AM on a ${day.toLowerCase()}.` }),
      scheduleValidThrough: validThrough(a), source: SOURCE,
    };
  },
};
