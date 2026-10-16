/**
 * How late is "late" in Live. One definition for the map's vehicle colours (local-api/live-vehicles.ts) and for the route
 * analysis (shared/stopDelay.ts), so the dashboard and the map always agree.
 */
export const EARLY_AT_OR_BELOW_MIN = -1.5;
export const LATE_AT_OR_ABOVE_MIN = 5.5;

export type DelayStatus = 'early' | 'on_time' | 'late';

export function delayStatus(delayMin: number): DelayStatus {
  if (delayMin <= EARLY_AT_OR_BELOW_MIN) return 'early';
  if (delayMin >= LATE_AT_OR_ABOVE_MIN) return 'late';
  return 'on_time';
}
