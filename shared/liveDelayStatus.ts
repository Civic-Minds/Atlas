/**
 * How late is "late" in Live. One definition for the map's vehicle colours (local-api/live-vehicles.ts) and for the route
 * analysis (shared/stopDelay.ts), so the dashboard and the map always agree.
 */
import { EARLY_AT_OR_BELOW_MIN, LATE_ABOVE_MIN } from './rules/live.js';

/** The thresholds live in shared/rules/live.ts (rules move 2). */
export { EARLY_AT_OR_BELOW_MIN, LATE_ABOVE_MIN };

export type DelayStatus = 'early' | 'on_time' | 'late';

export function delayStatus(delayMin: number): DelayStatus {
  if (delayMin <= EARLY_AT_OR_BELOW_MIN) return 'early';
  if (delayMin > LATE_ABOVE_MIN) return 'late';
  return 'on_time';
}
