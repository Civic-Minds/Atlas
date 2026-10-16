/**
 * The five headline figures of the Live dashboard with their change from last week.
 * A change is coloured only when it is bigger than normal noise, so a wobble never looks like an alarm. Where the file
 * holds a value per day (late share, trips that ran), noise is measured: the change must exceed twice the standard error
 * of the difference between the two weekly means, from the day-to-day spread (`dailyNoise`). Elsewhere a fixed amount
 * stands in (FIXED_NOISE, provisional until the analysis stores daily values for those measures too).
 */
import { dateRangeText, type CompareKey, type LiveV3, type WeekMetrics } from '../../shared/liveDashboard';

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

/** Shown under the tiles. Keep in step with dailyNoise and FIXED_NOISE below. */
export const NOISE_RULE = 'A change is coloured only when it is bigger than usual day to day: for late and trips that ran, more than the spread between days would explain; for the others, more than 2 points (bunching), 1 minute (trip time) or half a minute (extra wait). Smaller changes stay grey.';

/**
 * PROVISIONAL: smallest change that counts, in the figure's own unit (share as 0-1, or minutes), for measures without
 * daily values, and for late and delivered when too few days are recorded to measure the spread.
 */
export const FIXED_NOISE: Record<CompareKey, number> = { late: 0.02, bunching: 0.02, delivered: 0.01, tripTime: 1, extraWait: 0.5 };

/**
 * Noise for a week-over-week change measured from daily values: 2 x the standard error of the difference of two weekly
 * means. The file holds daily values for this week only, so their spread stands in for both weeks:
 * 2 * sd * sqrt(1/n1 + 1/n2). `null` with fewer than 3 days (no spread to measure).
 */
export function dailyNoise(daily: readonly number[], nThis: number, nLast: number): number | null {
  if (daily.length < 3 || nThis < 1 || nLast < 1) return null;
  const mean = daily.reduce((a, x) => a + x, 0) / daily.length;
  const sd = Math.sqrt(daily.reduce((a, x) => a + (x - mean) ** 2, 0) / (daily.length - 1));
  return 2 * sd * Math.sqrt(1 / nThis + 1 / nLast);
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
  const measured = noise != null;
  const big = Math.abs(now - before) > (noise ?? FIXED_NOISE[key]);
  const tone: KpiTone = !big ? 'same' : up !== lowerIsBetter ? 'better' : 'worse';
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
