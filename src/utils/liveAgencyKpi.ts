/**
 * The agency dashboard's headline tiles: the route dashboard's tiles (kpiTiles) on the network week, with running time
 * as a share over the timetable (minutes do not add up across routes), and every tile saying which routes it covers.
 */
import { runTimeOver, type AgencySummary } from '../../shared/liveAgency';
import { kpiDelta, kpiTiles, type Kpi } from './liveKpi';

const pctSigned = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`;

export function agencyKpiTiles(s: AgencySummary, coverage: string): Kpi[] {
  const w = s.weekly;
  if (!w) return [];
  const full = { ...w, health: [] };
  return kpiTiles(full, s.daily).map(k => {
    if (k.key !== 'tripTime') return { ...k, sub: `${k.sub} · ${coverage}` };
    const now = runTimeOver(w.thisWeek.tripTime), before = runTimeOver(w.lastWeek.tripTime);
    if (now == null) return k;
    return {
      ...k,
      value: pctSigned(now),
      sub: `${now >= 0 ? 'longer' : 'shorter'} than the timetable, the average trip · ${coverage}`,
      delta: w.comparable ? kpiDelta('tripTime', now, before, true, true) : null,
      lastWeekText: before != null ? pctSigned(before) : null,
    };
  });
}
