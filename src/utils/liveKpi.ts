/**
 * The five headline figures of the Live dashboard with their change from last week.
 * A change is coloured only when it is bigger than normal noise: the rule (weekChangeTone, dailyNoise, NOISE_RULE) lives
 * in shared/liveDashboard so the dashboard and Full analysis colour changes the same way.
 */
import { dailyNoise, dateRangeText, weekChangeTone, type CompareKey, type LiveV3, type WeekMetrics } from '../../shared/liveDashboard';
export { NOISE_RULE } from '../../shared/liveDashboard';

export type KpiTone = 'better' | 'worse' | 'same';

export interface Kpi {
  key: CompareKey;
  label: string;
  value: string;
  sub: string;
  /** Sample size behind this week's figure (0 when there is none). */
  n: number;
  /** What `n` counts, for the hover text. */
  unit: string;
  nLastWeek: number | null;
  delta: { arrow: 'up' | 'down' | 'none'; text: string; tone: KpiTone; spoken: string } | null;
  lastWeekText: string | null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const clean = (x: number) => String(round1(x)).replace('-', '−');
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${clean(Math.round(x * 1000) / 10)}%`;

/** The change chip: "▲ 1 pt", "▼ 0.1 pt", or "same". `isShare` figures are 0-1 and change in points; the rest in minutes. */
export function kpiDelta(key: CompareKey, now: number | null, before: number | null, lowerIsBetter: boolean, isShare: boolean, noise: number | null = null): Kpi['delta'] {
  if (now == null || before == null) return null;
  const diff = isShare ? (now - before) * 100 : now - before;
  const mag = round1(Math.abs(diff));
  const unit = isShare ? 'pt' : 'min';
  if (mag === 0) return { arrow: 'none', text: 'same', tone: 'same', spoken: 'same as last week' };
  const up = diff > 0;
  const { tone, big, measured } = weekChangeTone(key, now, before, lowerIsBetter, noise);
  const word = isShare ? (mag === 1 ? 'point' : 'points') : 'min';
  return {
    arrow: up ? 'up' : 'down',
    text: `${up ? '▲' : '▼'} ${clean(mag)} ${unit}`,
    tone,
    spoken: `${up ? 'up' : 'down'} ${clean(mag)} ${word} from last week${big ? (measured ? ', a bigger change than usual day to day' : '') : (measured ? ', within the usual day-to-day change' : ', a small change')}`,
  };
}

/** Daily values for this week's days with good recordings, where the file has them. */
export interface DailyValues { late: readonly number[]; delivered: readonly number[] }

/** The tiles that have a figure this week (a measure with nothing behind it is left out, not shown as a dash). */
export function kpiTiles(w: NonNullable<LiveV3['weekly']>, daily: DailyValues = { late: [], delivered: [] }): Kpi[] {
  const t = w.thisWeek, l = w.lastWeek;
  const nThis = t.healthyDates.length, nLast = l.healthyDates.length;
  const mk = (key: CompareKey, label: string, value: string, sub: string, n: number, unit: string, nLast: number | null, delta: Kpi['delta'], last: string | null): Kpi => ({ key, label, value, sub, n, unit, nLastWeek: nLast, delta, lastWeekText: last });
  const compare = w.comparable;
  const tiles = [
    mk('late', 'Late', t.late ? pct0(t.late.share) : '–', 'of departures 5.5+ min late', t.late?.n ?? 0, 'departures', l.late?.n ?? null,
      compare ? kpiDelta('late', t.late?.share ?? null, l.late?.share ?? null, true, true, dailyNoise(daily.late, nThis, nLast)) : null, l.late ? pct0(l.late.share) : null),
    mk('tripTime', 'Trip time', t.tripTime ? `${Math.round(t.tripTime.typicalMin)} min` : '–', t.tripTime ? `timetable ${Math.round(t.tripTime.scheduledMin)} min` : 'no full trips measured', t.tripTime?.n ?? 0, 'trips', l.tripTime?.n ?? null,
      compare ? kpiDelta('tripTime', t.tripTime?.typicalMin ?? null, l.tripTime?.typicalMin ?? null, true, false) : null, l.tripTime ? `${Math.round(l.tripTime.typicalMin)} min` : null),
    mk('extraWait', 'Extra wait', t.extraWait ? `${clean(t.extraWait.minutes)} min` : '–', 'longer than scheduled', t.extraWait?.gaps ?? 0, 'gaps', l.extraWait?.gaps ?? null,
      compare ? kpiDelta('extraWait', t.extraWait?.minutes ?? null, l.extraWait?.minutes ?? null, true, false) : null, l.extraWait ? `${clean(l.extraWait.minutes)} min` : null),
    mk('bunching', 'Bunching', t.bunching ? pct0(t.bunching.share) : '–', 'of gaps too close or too far apart', t.bunching?.gaps ?? 0, 'gaps', l.bunching?.gaps ?? null,
      compare ? kpiDelta('bunching', t.bunching?.share ?? null, l.bunching?.share ?? null, true, true) : null, l.bunching ? pct0(l.bunching.share) : null),
    mk('delivered', 'Service delivered', t.delivered?.share != null ? pct1(t.delivered.share) : '–', 'of scheduled trips ran', t.delivered ? t.delivered.seen + t.delivered.notSeen : 0, 'trips', l.delivered ? l.delivered.seen + l.delivered.notSeen : null,
      compare ? kpiDelta('delivered', t.delivered?.share ?? null, l.delivered?.share ?? null, false, true, dailyNoise(daily.delivered, nThis, nLast)) : null, l.delivered?.share != null ? pct1(l.delivered.share) : null),
  ];
  return tiles.filter(k => k.value !== '–');
}

/** The small caption under the tiles: which days each week is, and which were left out. */
export function weekCaption(w: NonNullable<LiveV3['weekly']>): string {
  const range = (wk: WeekMetrics) => (wk.dates.length ? dateRangeText(wk.dates[0], wk.dates[wk.dates.length - 1]) : 'no days');
  const base = `This week is ${range(w.thisWeek)} and last week is ${range(w.lastWeek)}. Days with gaps in our recordings are left out of both (${w.thisWeek.healthyDates.length} of ${w.thisWeek.dates.length} days counted this week, ${w.lastWeek.healthyDates.length} of ${w.lastWeek.dates.length} last week).`;
  return w.comparable ? base : `Not enough days of good recordings to compare two weeks: each needs at least ${w.minHealthyDays}. ${base}`;
}

export type DayKind = 'all' | 'weekday' | 'weekend';
export const isWeekendDate = (d: string) => { const g = new Date(`${d}T12:00:00Z`).getUTCDay(); return g === 0 || g === 6; };

/**
 * Late share for one kind of day, from the per-date counts over this week's days with good recordings, so the
 * "All days" figure is the same number as the Late tile.
 */
export function lateForDays(byDate: ReadonlyArray<{ date: string; n: number; late: number }>, healthyDates: readonly string[], kind: DayKind): { share: number; n: number; days: number } | null {
  const ok = new Set(healthyDates);
  const rows = byDate.filter(d => ok.has(d.date) && (kind === 'all' || (kind === 'weekend') === isWeekendDate(d.date)));
  const n = rows.reduce((a, d) => a + d.n, 0);
  return n > 0 ? { share: rows.reduce((a, d) => a + d.late, 0) / n, n, days: rows.length } : null;
}
