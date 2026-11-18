/**
 * How late is "late" in Live. One definition for the map's vehicle colours (local-api/live-vehicles.ts) and for the route
 * analysis (shared/stopDelay.ts), so the dashboard and the map always agree.
 */
export const EARLY_AT_OR_BELOW_MIN = -1.5;
/**
 * Late is MORE than 5½ min behind, as Live says it (LATE_DEFINITION, LATE_THRESHOLD: "more than 5½ min late"); a delay of
 * exactly 5.5 is on time (CIV-1812 item 7; it read >= 5.5 before). The analysis files' `lateAtOrAboveMin` field keeps its
 * stored name.
 */
export const LATE_ABOVE_MIN = 5.5;

export type DelayStatus = 'early' | 'on_time' | 'late';

export function delayStatus(delayMin: number): DelayStatus {
  if (delayMin <= EARLY_AT_OR_BELOW_MIN) return 'early';
  if (delayMin > LATE_ABOVE_MIN) return 'late';
  return 'on_time';
}
