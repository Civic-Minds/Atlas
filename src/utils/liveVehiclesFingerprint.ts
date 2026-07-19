/** Cheap signature of live vehicle state so polls can skip redundant React updates. */

export interface FingerprintableVehicle {
  id: string;
  lat: number;
  lon: number;
  status?: string | null;
  delayMin?: number | null;
  headsign?: string | null;
  routeShortName?: string | null;
}

/**
 * Stable fingerprint of vehicle positions/status for equality checks.
 * Positions rounded to ~1m so tiny GPS noise doesn't force a re-render every poll.
 */
export function liveVehiclesFingerprint(vehicles: FingerprintableVehicle[]): string {
  if (vehicles.length === 0) return '';
  const parts = vehicles.map(v =>
    [
      v.id,
      v.lat.toFixed(5),
      v.lon.toFixed(5),
      v.status ?? '',
      v.delayMin == null ? '' : String(Math.round(v.delayMin * 10) / 10),
      v.headsign ?? '',
      v.routeShortName ?? '',
    ].join(':'),
  );
  parts.sort();
  return `${vehicles.length}|${parts.join('|')}`;
}

/** True when two lists describe the same map-relevant vehicle state. */
export function liveVehiclesEqual(
  a: FingerprintableVehicle[],
  b: FingerprintableVehicle[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return liveVehiclesFingerprint(a) === liveVehiclesFingerprint(b);
}
