/**
 * The Live "Yesterday" view (CIV-278): one service day against the same weekday a week earlier, built from the
 * analysis's per-day figures (`v3.daily`, the same definitions as the weekly view). Shaped like the weekly block, so
 * the tiles, their change lines and the day-to-day noise rule are reused unchanged. Built by scripts/live-yesterday.ts
 * (published to R2 under atlas/live/<agency>/yesterday/) and by the local API.
 */
import type { LiveV3, WeekMetrics } from './liveDashboard';
import { combineWeeks } from './liveAgency';

export interface DayFigures extends Omit<WeekMetrics, 'dates' | 'healthyDates'> {
  healthy: boolean;
  lateByHour: Array<{ hour: number; n: number; lateShare: number }>;
}

export interface LiveYesterday {
  schema: 1;
  agency: string;
  /** Null for the network (agency) file. */
  route: string | null;
  date: string;
  compareDate: string;
  /** The weekly block's shape, with this day as "this week" and the same weekday a week earlier as "last week". */
  weekly: NonNullable<LiveV3['weekly']>;
  /** Late share and trips that ran on each good day in the archive window: the day-to-day noise. */
  daily: { late: number[]; delivered: number[] };
  lateByHour: DayFigures['lateByHour'];
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

const asWeek = (date: string, d: DayFigures | undefined): WeekMetrics => ({
  days: d ? 1 : 0, dates: d ? [date] : [], healthyDates: d?.healthy ? [date] : [],
  late: d?.late ?? null, tripTime: d?.tripTime ?? null, extraWait: d?.extraWait ?? null, bunching: d?.bunching ?? null, delivered: d?.delivered ?? null,
});

/** The latest day in the file (or `date`) against the same weekday a week before. Null when the file has no daily figures. */
export function yesterdayFromV3(v3: LiveV3, agency: string, route: string, date?: string): LiveYesterday | null {
  const daily = (v3 as LiveV3 & { daily?: Record<string, DayFigures> }).daily;
  if (!daily) return null;
  const dates = Object.keys(daily).sort();
  const day = date ?? dates[dates.length - 1];
  if (!day || !daily[day]) return null;
  const compareDate = addDays(day, -7);
  const good = dates.filter(d => daily[d].healthy);
  return {
    schema: 1, agency, route, date: day, compareDate,
    weekly: {
      minHealthyDays: 1,
      health: [],
      thisWeek: asWeek(day, daily[day]),
      lastWeek: asWeek(compareDate, daily[compareDate]),
      comparable: !!daily[day]?.healthy && !!daily[compareDate]?.healthy,
    },
    daily: {
      late: good.flatMap(d => (daily[d].late && daily[d].late!.n > 0 ? [daily[d].late!.share] : [])),
      delivered: good.flatMap(d => (daily[d].delivered ? [daily[d].delivered!.share] : [])),
    },
    lateByHour: daily[day].lateByHour,
  };
}

/** The network's yesterday: every route's day added up (busy routes weigh more), as the weekly agency figures are. */
export function agencyYesterday(agency: string, routes: readonly LiveYesterday[]): LiveYesterday | null {
  const same = routes.filter(r => r.date === routes[0]?.date);
  if (!same.length) return null;
  const hours = new Map<number, { n: number; late: number }>();
  for (const r of same) for (const h of r.lateByHour) { const x = hours.get(h.hour) ?? { n: 0, late: 0 }; x.n += h.n; x.late += h.lateShare * h.n; hours.set(h.hour, x); }
  const thisWeek = combineWeeks(same.map(r => r.weekly.thisWeek));
  const lastWeek = combineWeeks(same.map(r => r.weekly.lastWeek));
  return {
    schema: 1, agency, route: null, date: same[0].date, compareDate: same[0].compareDate,
    weekly: { minHealthyDays: 1, health: [], thisWeek, lastWeek, comparable: thisWeek.healthyDates.length > 0 && lastWeek.healthyDates.length > 0 },
    // The network's noise: each route's day-to-day spread pooled (a conservative stand-in until the network's own days are stored).
    daily: { late: same.flatMap(r => r.daily.late), delivered: same.flatMap(r => r.daily.delivered) },
    lateByHour: [...hours].sort((a, b) => a[0] - b[0]).map(([hour, x]) => ({ hour, n: x.n, lateShare: x.n ? x.late / x.n : 0 })),
  };
}
