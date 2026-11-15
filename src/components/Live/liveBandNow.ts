import type { DashboardBand } from '../../../shared/liveDashboard';
import { getNowPeriodForTimezone } from '../Interval/FilterChips';
import { PERIOD_BANDS_ONLY } from './sections/figures';

/**
 * CIV-1451: the period the Live map and a route's Explore view open on, the map's own (the agency's current period, CIV-1097: no All day). Live
 * measures AM peak to Evening only, so Late and Overnight open on Evening, the last period it has.
 */
export function liveBandNow(timezone?: string | null, now: Date = new Date()): DashboardBand {
  const p = getNowPeriodForTimezone(timezone, now);
  return PERIOD_BANDS_ONLY.some(([k]) => k === p) ? p as DashboardBand : 'evening';
}
