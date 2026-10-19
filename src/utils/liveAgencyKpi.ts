/**
 * The agency dashboard's headline tiles: the route dashboard's tiles (kpiTiles) on the network week, so every Live
 * surface writes each figure the same way. Run time is in minutes here too (the average trip over all routes), as on
 * the route pages, not a share over the timetable.
 */
import type { AgencySummary } from '../../shared/liveAgency';
import { kpiTiles, type Kpi } from './liveKpi';

export function agencyKpiTiles(s: AgencySummary): Kpi[] {
  const w = s.weekly;
  if (!w) return [];
  return kpiTiles({ ...w, health: [] }, s.daily);
}
