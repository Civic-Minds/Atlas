/**
 * How late is "late" in Live. One definition for the map's vehicle colours (local-api/live-vehicles.ts) and for the route
 * analysis (shared/stopDelay.ts), so the dashboard and the map always agree.
 */
import { DEFAULT_ON_TIME_WINDOW, EARLY_AT_OR_BELOW_MIN, LATE_ABOVE_MIN, type OnTimeWindow } from './rules/live.js';

/** The thresholds live in shared/rules/live.ts (rules move 2). */
export { EARLY_AT_OR_BELOW_MIN, LATE_ABOVE_MIN };

export type DelayStatus = 'early' | 'on_time' | 'late';

/** `window`: the agency's on-time window (onTimeWindow, CIV-2222); Atlas's default when left out. */
export function delayStatus(delayMin: number, window: OnTimeWindow = DEFAULT_ON_TIME_WINDOW): DelayStatus {
  if (delayMin <= window.earlyAtOrBelowMin) return 'early';
  if (delayMin > window.lateAboveMin) return 'late';
  return 'on_time';
}
