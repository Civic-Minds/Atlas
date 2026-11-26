import type { GtfsData } from '../../types/gtfs.js';
import { cleanHeadsign } from '../../shared/cleanHeadsign.js';

/**
 * CIV-2999 (#1846, Ryan 2026-11-26 picked 1: "show each direction's last stop as the destination", RTC first): some feeds
 * give a street and a direction word as the trip headsign, not where the trip goes (RTC Las Vegas: "RED LINE Maryland Pkwy
 * Northbound", "101 Rainbow Southbound"). With the agency's `headsignFromLastStop` set, a headsign that carries a
 * direction word ("Northbound" ... "Westbound") is renamed to the last stop most of its trips end at, tidied to read as a
 * place (lastStopDestination). Only the name changes: the trips grouped under one headsign stay one group, and no two
 * groups are joined (manager, 2026-11-26: Ryan asked for the destination name, not more rows). Other headsigns are left
 * as published. Opt-in per agency: Atlas can't tell a street from a
 * destination by itself (both directions sharing a name matched 617 routes at 176 agencies, most of them loops and real
 * terminals).
 */
const DIRECTION_WORD = /\b(north|south|east|west)bound\b/i;

/**
 * A stop-position name as a destination: "EB Wellness before Willow" -> "Wellness & Willow", "South Strip Transit Terminal
 * Bay 6" -> "South Strip Transit Terminal". Drops a leading direction code and a trailing bay, and joins "X before/after Y"
 * as "X & Y". Anything else is kept as written ("Harry Reid Intl Airport Zero Level", "LV Blvd at Fremont St Experience").
 */
export function lastStopDestination(stopName: string): string {
  let name = stopName.trim();
  name = name.replace(/^(NB|SB|EB|WB)\s+/i, '');
  name = name.replace(/\s+Bay\s+\d+[A-Z]?$/i, '');
  name = name.replace(/\s+(before|after)\s+/i, ' & ');
  return name.trim() || stopName.trim();
}

export function headsignsFromLastStop(gtfs: GtfsData): { gtfs: GtfsData; renamed: number } {
  const lastStopByTrip = new Map<string, { seq: number; stopId: string }>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const current = lastStopByTrip.get(st.trip_id);
    if (!current || seq > current.seq) lastStopByTrip.set(st.trip_id, { seq, stopId: st.stop_id });
  }
  const stopNameById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));
  // Rename by headsign, not by trip, so the trips the feed groups under one headsign stay one group (one row): each
  // headsign takes the last stop most of its trips end at. A trip ending elsewhere keeps its group's name.
  // The group is the headsign as Atlas reads it (cleanHeadsign, direction words kept as the pipeline keeps them), so
  // "103 Decatur Northbound" and "103A Decatur Northbound", one row before, stay one row.
  const routeById = new Map((gtfs.routes ?? []).map(r => [r.route_id, r]));
  const groupKey = (t: { route_id: string; direction_id?: string; trip_headsign?: string }) => {
    const route = routeById.get(t.route_id);
    const read = cleanHeadsign(t.trip_headsign ?? '', route?.route_short_name ?? null, route?.route_long_name ?? null, { keepDirection: true });
    return `${t.route_id}|${t.direction_id ?? ''}|${(read || t.trip_headsign || '').trim().toLowerCase()}`;
  };
  const endings = new Map<string, Map<string, number>>();
  const tripCount = new Map<string, number>();
  for (const trip of gtfs.trips ?? []) {
    if (!DIRECTION_WORD.test(trip.trip_headsign ?? '')) continue;
    const stopName = stopNameById.get(lastStopByTrip.get(trip.trip_id)?.stopId ?? '')?.trim();
    if (!stopName) continue;
    const key = groupKey(trip);
    const counts = endings.get(key) ?? new Map<string, number>();
    const name = lastStopDestination(stopName);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    endings.set(key, counts);
    tripCount.set(key, (tripCount.get(key) ?? 0) + 1);
  }
  // Two headsigns of one route and direction whose trips mostly end at the same stop would merge under one name; the
  // headsign with more trips takes the name and the other keeps the feed's, so no two groups join.
  const nameFor = new Map<string, string>();
  const taken = new Set((gtfs.trips ?? []).filter(t => !DIRECTION_WORD.test(t.trip_headsign ?? ''))
    .map(t => `${t.route_id}|${t.direction_id ?? ''}|${(t.trip_headsign ?? '').trim().toLowerCase()}`));
  for (const [key, counts] of [...endings].sort((a, b) => (tripCount.get(b[0]) ?? 0) - (tripCount.get(a[0]) ?? 0) || a[0].localeCompare(b[0]))) {
    const name = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const slot = `${key.split('|').slice(0, 2).join('|')}|${name.toLowerCase()}`;
    if (taken.has(slot)) continue;
    taken.add(slot);
    nameFor.set(key, name);
  }
  let renamed = 0;
  const trips = (gtfs.trips ?? []).map(trip => {
    const name = DIRECTION_WORD.test(trip.trip_headsign ?? '') ? nameFor.get(groupKey(trip)) : undefined;
    if (!name) return trip;
    renamed++;
    // The leading route or branch number stays ("106A Centennial Hills / Rancho Southbound" -> "106A Bonneville Transit
    // Center"): the branch steps read it, and the card drops it as it did before.
    const lead = /^(\d+[A-Z]{0,2})\s+/.exec(trip.trip_headsign ?? '')?.[1];
    return { ...trip, trip_headsign: lead ? `${lead} ${name}` : name };
  });
  return { gtfs: { ...gtfs, trips }, renamed };
}
