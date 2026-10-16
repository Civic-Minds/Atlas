/**
 * The agency dashboard's headline tiles: the route dashboard's tiles (kpiTiles) on the network week, with running time
 * as a share over the timetable (minutes do not add up across routes), and every tile saying which routes it covers.
 */
import { runTimeOver, type AgencySummary } from '../../shared/liveAgency';
import { kpiDelta, kpiTiles, type Kpi } from './liveKpi';

/** Run time against the timetable, as the tile writes it: "5% faster", "3% slower". */
const pctWord = (x: number) => `${Math.abs(Math.round(x * 100))}% ${x < 0 ? 'faster' : 'slower'}`;

export function agencyKpiTiles(s: AgencySummary): Kpi[] {
  const w = s.weekly;
  if (!w) return [];
  const full = { ...w, health: [] };
  return kpiTiles(full, s.daily).map(k => {
    if (k.key !== 'tripTime') return k;
    const now = runTimeOver(w.thisWeek.tripTime), before = runTimeOver(w.lastWeek.tripTime);
    if (now == null) return k;
    return {
      ...k,
      value: pctWord(now),
      sub: 'than the timetable',
      delta: w.comparable ? kpiDelta('tripTime', now, before, true, true, null, before != null ? pctWord(before) : null) : null,
      lastWeekText: before != null ? pctWord(before) : null,
    };
  });
}
