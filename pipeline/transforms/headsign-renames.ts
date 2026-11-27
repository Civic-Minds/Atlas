import type { GtfsData } from '../../types/gtfs.js';

/**
 * CIV-3124 (#1908; Ryan, 2026-11-27: "but on the sound transit website it is called "Issaquah Highlands Park & Ride""): an
 * agency's hand-checked trip headsign renames, as stop-renames.ts does for stop names (#1855). Each entry names one route
 * and the exact headsign the feed gives its trips; those trips take the new headsign only while the feed still says
 * `from`, so a feed that fixes or changes it is left as published and the entry shows up as stale. No general rule: every
 * rename is listed and checked by hand (King County Metro's "Issaquah Highlands Park & Ride Issaquah Transit Center" runs
 * the destination and a stop on the way together; the agency names the destination alone).
 */
export interface HeadsignRename {
  routeId: string;
  /** The feed's trip_headsign, exactly. */
  from: string;
  to: string;
}

export interface HeadsignRenameResult {
  gtfs: GtfsData;
  /** Trips renamed. */
  renamed: number;
  /** Entries no trip of their route matches any more. */
  stale: HeadsignRename[];
}

export function renameHeadsigns(gtfs: GtfsData, renames: readonly HeadsignRename[]): HeadsignRenameResult {
  const key = (routeId: string, headsign: string) => `${routeId}\u0000${headsign}`;
  const byKey = new Map(renames.map(r => [key(r.routeId, r.from), r]));
  const applied = new Set<HeadsignRename>();
  let renamed = 0;
  const trips = (gtfs.trips ?? []).map(trip => {
    const r = byKey.get(key(trip.route_id, trip.trip_headsign ?? ''));
    if (!r) return trip;
    applied.add(r);
    renamed++;
    return { ...trip, trip_headsign: r.to };
  });
  return { gtfs: { ...gtfs, trips }, renamed, stale: renames.filter(r => !applied.has(r)) };
}
