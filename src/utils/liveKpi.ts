/**
 * The five headline figures of the Live dashboard with their change from last week.
 * A change is coloured only when it is bigger than normal noise: the rule (weekChangeTone, dailyNoise, NOISE_RULE) lives
 * in shared/liveDashboard so the dashboard and Full analysis colour changes the same way.
 */
import { isWeekendDate, dailyNoise, dateRangeText, healthyCounts, weekChangeTone, type CompareKey, type DailyValues, type DayKind, type LiveV3, type WeekMetrics } from '../../shared/liveDashboard';
import { LATE_TILE_CAPTION, bunchPartsText, excludingText, runTimeDiffText } from '../../shared/liveWording';
import { tenth } from '../../shared/liveFormat';
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
  /** A second caption line saying what the figure covers (the route tiles' Run time: "both directions"). */
  scope?: string;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const clean = tenth;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
/** The Bunching tile shows its two parts when the file has them (CIV-302): "7% · 21%" over "too close · too far apart". */
const bunchSplit = (b: { bunched?: number; gapped?: number }) => b.bunched != null && b.gapped != null;
const BUNCHING_SPLIT_CAPTION = 'too close · too far apart';
const pct1 = (x: number) => `${clean(Math.round(x * 1000) / 10)}%`;

/**
 * The change line: "last week 10%" (label first, then last week's value as the tile writes it, `lastText`) or "same as
 * last week". The direction is the separate `arrow`, drawn as a small mark coloured by `tone`. Without `lastText` the
 * line gives the size of the change ("1 pt"). `isShare` figures are 0-1 and change in points; the rest in minutes.
 */
export function kpiDelta(key: CompareKey, now: number | null, before: number | null, lowerIsBetter: boolean, isShare: boolean, noise: number | null = null, lastText: string | null = null, nowText: string | null = null): Kpi['delta'] {
  if (now == null || before == null) return null;
  const diff = isShare ? (now - before) * 100 : now - before;
  const mag = round1(Math.abs(diff));
  const unit = isShare ? 'pt' : 'min';
  // Equal as displayed (same rounding as the tile) reads as no change, never an arrow next to an equal number.
  if (mag === 0 || (lastText != null && nowText === lastText)) return { arrow: 'none', text: lastText ? 'same as last week' : 'same', tone: 'same', spoken: 'same as last week' };
  const up = diff > 0;
  const { tone, big, measured } = weekChangeTone(key, now, before, lowerIsBetter, noise);
  const word = isShare ? (mag === 1 ? 'point' : 'points') : 'min';
  return {
    arrow: up ? 'up' : 'down',
    text: lastText ? `last week ${lastText}` : `${clean(mag)} ${unit}`,
    tone,
    spoken: `${lastText ? `last week ${lastText}, ${up ? 'up' : 'down'} ${clean(mag)} ${word}` : `${up ? 'up' : 'down'} ${clean(mag)} ${word} from last week`}${big ? (measured ? ', a bigger change than usual day to day' : '') : (measured ? ', within the usual day-to-day change' : ', a small change')}`,
  };
}

export type { DailyValues };

/** "2 min faster than the timetable", from the same whole minutes the tile and the Run time section show. */
function runTimeCaption(typicalMin: number, scheduledMin: number): string {
  return runTimeDiffText(Math.round(typicalMin) - Math.round(scheduledMin));
}

/** The tiles that have a figure this week (a measure with nothing behind it is left out, not shown as a dash). `runTimeScope` is the Run time tile's second caption line. */
export function kpiTiles(w: NonNullable<LiveV3['weekly']>, daily: DailyValues = {}, runTimeScope?: string): Kpi[] {
  const t = w.thisWeek, l = w.lastWeek;
  const nThis = t.healthyDates.length, nLast = l.healthyDates.length;
  const mk = (key: CompareKey, label: string, value: string, sub: string, n: number, unit: string, nLast: number | null, delta: Kpi['delta'], last: string | null): Kpi => ({ key, label, value, sub, n, unit, nLastWeek: nLast, delta, lastWeekText: last });
  const compare = w.comparable;
  /** The one noise for every tile: that measure's own day-to-day spread (null leaves the fixed stand-in). */
  const noise = (key: CompareKey) => dailyNoise(daily[key] ?? [], nThis, nLast);
  const bunchText = (b: WeekMetrics['bunching']) => (b ? (bunchSplit(b) ? bunchPartsText(b.share, b.bunched!, b.gapped!) : pct0(b.share)) : null);
  // Last week's two parts are shown only when this week's are too (and last week has them): the same form on both lines.
  const lastBunch = l.bunching ? (t.bunching && bunchSplit(t.bunching) && bunchSplit(l.bunching) ? bunchText(l.bunching) : pct0(l.bunching.share)) : null;
  const lateT = t.late ? pct0(t.late.share) : null, tripT = t.tripTime ? `${Math.round(t.tripTime.typicalMin)} min` : null, waitT = t.extraWait ? `${clean(t.extraWait.minutes)} min` : null, delT = t.delivered?.share != null ? pct1(t.delivered.share) : null;
  const tiles = [
    mk('late', 'Late', t.late ? pct0(t.late.share) : '–', LATE_TILE_CAPTION, t.late?.n ?? 0, 'departures', l.late?.n ?? null,
      compare ? kpiDelta('late', t.late?.share ?? null, l.late?.share ?? null, true, true, noise('late'), l.late ? pct0(l.late.share) : null, lateT) : null, l.late ? pct0(l.late.share) : null),
    mk('tripTime', 'Run time', t.tripTime ? `${Math.round(t.tripTime.typicalMin)} min` : '–', t.tripTime ? runTimeCaption(t.tripTime.typicalMin, t.tripTime.scheduledMin) : 'too few trips measured', t.tripTime?.n ?? 0, 'trips', l.tripTime?.n ?? null,
      compare ? kpiDelta('tripTime', t.tripTime?.typicalMin ?? null, l.tripTime?.typicalMin ?? null, true, false, noise('tripTime'), l.tripTime ? `${Math.round(l.tripTime.typicalMin)} min` : null, tripT) : null, l.tripTime ? `${Math.round(l.tripTime.typicalMin)} min` : null),
    mk('extraWait', 'Extra wait', t.extraWait ? `${clean(t.extraWait.minutes)} min` : '–', 'longer wait than scheduled', t.extraWait?.gaps ?? 0, 'gaps', l.extraWait?.gaps ?? null,
      compare ? kpiDelta('extraWait', t.extraWait?.minutes ?? null, l.extraWait?.minutes ?? null, true, false, noise('extraWait'), l.extraWait ? `${clean(l.extraWait.minutes)} min` : null, waitT) : null, l.extraWait ? `${clean(l.extraWait.minutes)} min` : null),
    mk('bunching', 'Bunching', bunchText(t.bunching) ?? '–', t.bunching && bunchSplit(t.bunching) ? BUNCHING_SPLIT_CAPTION : 'of gaps between cars bunched or too long', t.bunching?.gaps ?? 0, 'gaps', l.bunching?.gaps ?? null,
      compare ? kpiDelta('bunching', t.bunching?.share ?? null, l.bunching?.share ?? null, true, true, noise('bunching'), lastBunch, bunchText(t.bunching)) : null, lastBunch),
    mk('delivered', 'Service delivered', t.delivered?.share != null ? pct1(t.delivered.share) : '–', t.delivered ? 'of scheduled trips ran' : 'of scheduled trips ran', t.delivered ? t.delivered.seen + t.delivered.notSeen : 0, 'trips', l.delivered ? l.delivered.seen + l.delivered.notSeen : null,
      compare ? kpiDelta('delivered', t.delivered?.share ?? null, l.delivered?.share ?? null, false, true, noise('delivered'), l.delivered?.share != null ? pct1(l.delivered.share) : null, delT) : null, l.delivered?.share != null ? pct1(l.delivered.share) : null),
  ];
  return tiles.filter(k => k.value !== '–').map(k => (k.key === 'tripTime' && runTimeScope ? { ...k, scope: runTimeScope } : k));
}

/**
 * The line under the tiles, only when the two weeks cannot be compared (the subtitle names both weeks otherwise):
 * "Oct 8–14: too few days of good recordings to compare with Oct 1–7".
 */
export function weekNotComparableLine(w: NonNullable<LiveV3['weekly']>): string | null {
  const range = (wk: WeekMetrics) => (wk.dates.length ? dateRangeText(wk.dates[0], wk.dates[wk.dates.length - 1]) : 'no days');
  return w.comparable ? null : `${range(w.thisWeek)}: too few days of good recordings to compare with ${range(w.lastWeek)}`;
}

/** The days a week left out (recorded too incompletely to count). */
export const leftOutDates = (wk: WeekMetrics): string[] => wk.dates.filter(d => !wk.healthyDates.includes(d));

/**
 * The same line in two parts, so the days left out can stand on a line of their own: "This week is Oct 8–14 and last week is
 * Oct 1–7." and "Excluding Oct 11 this week, Oct 5 last week." (only the week that left days out is named; null when every day
 * of both weeks counted).
 */
export function weekWindowParts(w: NonNullable<LiveV3['weekly']>): { weeks: string; days: string | null } {
  const range = (wk: WeekMetrics) => (wk.dates.length ? dateRangeText(wk.dates[0], wk.dates[wk.dates.length - 1]) : 'no days');
  const weeks = `This week is ${range(w.thisWeek)} and last week is ${range(w.lastWeek)}.`;
  const t = excludingText(leftOutDates(w.thisWeek)), l = excludingText(leftOutDates(w.lastWeek));
  const tail = (x: string) => x.replace(/^Excluding /, '');
  const days = t && l ? `${t} this week, ${tail(l)} last week.` : t ? `${t} this week.` : l ? `${l} last week.` : null;
  return {
    weeks: w.comparable ? weeks : `Not enough days of good recordings to compare two weeks: each needs at least ${w.minHealthyDays}. ${weeks}`,
    days,
  };
}

/** The two weeks and how many days of each were counted, for "How this is measured" (the recording-gaps rule is a Limits line). */
export function weekWindowLine(w: NonNullable<LiveV3['weekly']>): string {
  const p = weekWindowParts(w);
  return p.days ? `${p.weeks} ${p.days}` : p.weeks;
}

export { isWeekendDate, type DayKind };

/**
 * Late share for one kind of day, from the per-date counts over this week's days with good recordings, so the
 * "All days" figure is the same number as the Late tile.
 */
export function lateForDays(byDate: ReadonlyArray<{ date: string; n: number; late: number }>, healthyDates: readonly string[], kind: DayKind): { share: number; n: number; days: number } | null {
  const c = healthyCounts(byDate, healthyDates, kind);
  return c ? { share: c.lateShare, n: c.n, days: c.days } : null;
}
