/**
 * The agency dashboard's headline tiles: the route dashboard's tiles (kpiTiles) on the network week, so every Live
 * surface writes each figure the same way. Run time is the one exception (CIV-945): an average of minutes over routes of
 * very different lengths means nothing, so the network's run time is the typical trip against the timetable, as a share
 * ("7% faster"), and the route's own minutes show only when a route is picked.
 */
import { FIXED_NOISE, dailyNoise } from '../../shared/liveDashboard';
import { runTimeOver, type AgencySummary } from '../../shared/liveAgency';
import { kpiDelta, kpiTiles, type Kpi } from './liveKpi';

import { runTimeShareText, TRIP_TIME_LABEL } from '../../shared/liveWording';
export { runTimeShareText };
/** The row's name on All routes, so the share reads against the timetable (wording to confirm, CIV-945). */
export const NETWORK_RUN_TIME_LABEL = `${TRIP_TIME_LABEL} vs schedule`;
/** The tile's caption and hover text (wording to confirm, CIV-945). */
export const NETWORK_RUN_TIME_SUB = 'typical trip against the schedule, all routes';

export function agencyKpiTiles(s: AgencySummary): Kpi[] {
  const w = s.weekly;
  if (!w) return [];
  const tiles = kpiTiles({ ...w, health: [] }, s.daily);
  const t = w.thisWeek.tripTime, l = w.lastWeek.tripTime;
  const now = runTimeOver(t), before = runTimeOver(l);
  if (now == null) return tiles;
  // The day-to-day noise in minutes, as a share of the scheduled trip: the arrow and its colour follow the share shown.
  const noiseMin = dailyNoise(s.daily?.tripTime ?? [], w.thisWeek.healthyDates.length, w.lastWeek.healthyDates.length);
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
    delta: (() => { const d = w.comparable ? kpiDelta('tripTime', now, before, true, true, noise, lastText, nowText) : null; return d && lastText && d.arrow !== 'none' ? { ...d, spoken: `last week ${lastText}` } : d; })(),
  }));
}

