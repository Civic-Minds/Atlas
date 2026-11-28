/**
 * The agency dashboard's headline tiles: the route dashboard's tiles (kpiTiles) on the network week, so every Live
 * surface writes each figure the same way. Run time is the one exception (CIV-945): an average of minutes over routes of
 * very different lengths means nothing, so the network's run time is the typical trip against the timetable, as a share
 * ("7% faster"), and the route's own minutes show only when a route is picked.
 */
import { FIXED_NOISE, dailyNoise, weekForBand, type DashboardBand } from '../../shared/liveDashboard';
import { runTimeOver, type AgencySummary } from '../../shared/liveAgency';
import { kpiDelta, kpiTiles, type Kpi } from './liveKpi';

import { onTimeWindowWords, runTimeShareText, TRIP_TIME_LABEL, weekScopeText } from '../../shared/liveWording';
import { PERIOD_LABELS } from '../../shared/config';
import { ALL_ROUTES_LABEL } from '../content/noticeCopy';
export { runTimeShareText };
/** The row's name on All routes, so the share reads against the timetable (wording to confirm, CIV-945). */
export const NETWORK_RUN_TIME_LABEL = `${TRIP_TIME_LABEL} vs schedule`;
/** The tile's caption and hover text (wording to confirm, CIV-945). */
export const NETWORK_RUN_TIME_SUB = 'typical trip against the schedule, all routes';

/** The network's week heading, "All routes · <time of day>": the week table's scope line and, since CIV-2929, the bar's title. */
export const agencyWeekScope = (band: DashboardBand): string => weekScopeText(ALL_ROUTES_LABEL, band === 'all' ? null : PERIOD_LABELS[band]);

/**
 * #1925: the arrow beside "4% faster" follows the number shown, as on every other row ("5% faster" → "4% faster" is ▼,
 * the colour says it got worse). Faster on one week and slower on the other: the two numbers count different things, so
 * no arrow. Whole percents, as runTimeShareText writes them.
 */
export function shownShareArrow(now: number, before: number): 'up' | 'down' | 'none' {
  const a = Math.round(now * 100), b = Math.round(before * 100);
  if (a * b < 0 || Math.abs(a) === Math.abs(b)) return 'none';
  return Math.abs(a) > Math.abs(b) ? 'up' : 'down';
}

/**
 * `band` is the time of day picked (CIV-1459): no tiles when the file has no figures for it, never the whole day's in its place.
 * `oneBunchingFigure`: Studio shows Bunching as one share, as on its route panel (CIV-2021, #1925: "11% · 4%" unlabelled).
 */
export function agencyKpiTiles(s: AgencySummary, band: DashboardBand = 'all', { oneBunchingFigure = false }: { oneBunchingFigure?: boolean } = {}): Kpi[] {
  const w = weekForBand(s.weekly, band);
  if (!w) return [];
  // The daily values behind the noise are the whole day's: a time of day uses the fixed stand-in.
  const daily = band === 'all' ? s.daily : { late: [], delivered: [], tripTime: [], extraWait: [], bunching: [] };
  const tiles = kpiTiles({ ...w, health: [] }, daily, undefined, { oneBunchingFigure, window: onTimeWindowWords(s.agency) });
  const t = w.thisWeek.tripTime, l = w.lastWeek.tripTime;
  const now = runTimeOver(t), before = runTimeOver(l);
  if (now == null) return tiles;
  // The day-to-day noise in minutes, as a share of the scheduled trip: the arrow and its colour follow the share shown.
  const noiseMin = dailyNoise(daily?.tripTime ?? [], w.thisWeek.healthyDates.length, w.lastWeek.healthyDates.length);
  // Too few days for a spread: the fixed minute stand-in, as the same share.
  const noise = t && t.scheduledMin > 0 ? (noiseMin ?? FIXED_NOISE.tripTime) / t.scheduledMin : null;
  const nowText = runTimeShareText(now), lastText = before != null ? runTimeShareText(before) : null;
  return tiles.map(k => (k.key !== 'tripTime' ? k : {
    ...k,
    label: NETWORK_RUN_TIME_LABEL,
    value: nowText,
    sub: NETWORK_RUN_TIME_SUB,
    lastWeekText: lastText,
    // The hover says last week's share in the same words, never "down N points" (going from 5% to 7% faster is not "down").
    delta: (() => {
      const d = w.comparable ? kpiDelta('tripTime', now, before, true, true, noise, lastText, nowText) : null;
      return d && lastText && d.arrow !== 'none' && before != null ? { ...d, arrow: shownShareArrow(now, before), spoken: `last week ${lastText}` } : d;
    })(),
  }));
}

