import { getAgencyDataUrl } from '../shared/config.js';
import { resolveDisplayHeadsign } from '../shared/headsignDisplay.js';

/**
 * CIV-3044 (Ryan, 2026-11-26): a live vehicle's direction and destination come from the timetable by its trip id, from
 * the agency's published trips file (the pipeline's trip id → direction and headsign, after it fills missing directions).
 * Read once per agency and kept; a failed read is retried after a few minutes and gives an empty map.
 */
const KEEP_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
export interface ScheduleTrip { d: number | null; h: string | null }
export type ScheduleTrips = ReadonlyMap<string, ScheduleTrip>;
const cache = new Map<string, { at: number; ok: boolean; trips: Promise<Map<string, ScheduleTrip>> }>();

async function load(slug: string): Promise<Map<string, ScheduleTrip>> {
  const res = await fetch(getAgencyDataUrl(slug, '-trips'));
  if (!res.ok) throw new Error(`trips file ${res.status}`);
  const data = await res.json() as Record<string, { d?: unknown; h?: unknown } | undefined>;
  const trips = new Map<string, ScheduleTrip>();
  for (const [id, t] of Object.entries(data)) {
    if (!t) continue;
    const d = Number(t.d);
    trips.set(id, { d: t.d == null || !Number.isFinite(d) ? null : d, h: typeof t.h === 'string' && t.h.trim() ? t.h : null });
  }
  return trips;
}

export function scheduleTrips(slug: string, now = Date.now()): Promise<Map<string, ScheduleTrip>> {
  const hit = cache.get(slug);
  if (hit && now - hit.at < (hit.ok ? KEEP_MS : RETRY_MS)) return hit.trips;
  const entry = { at: now, ok: true, trips: load(slug).catch(() => { entry.ok = false; return new Map<string, ScheduleTrip>(); }) };
  cache.set(slug, entry);
  return entry.trips;
}

/**
 * The direction and destination Live gives a vehicle (CIV-3044, Ryan's pick): the timetable's, found by the vehicle's
 * trip id, first. When the trip id isn't in the timetable, neither the feed's direction nor its headsign is used: both
 * are left empty, so the map's backup (which way the vehicle moves along the route's shapes, inferLiveDirection) places
 * it, and a vehicle that can't be placed stays ungrouped ("Direction unclear"). The destination is cleaned the way the
 * map's shapes name theirs (resolveDisplayHeadsign), so a vehicle joins its shape's group.
 *
 * Without a timetable for the agency (the file failed to load, or is empty) the feed's own values are kept, as before.
 */
export function scheduledDirection(
  rec: { tripId: string; d: number | null; hs: string | null },
  schedule: ScheduleTrips | null | undefined,
  route: { shortName: string; displayName: string },
): { directionId: number | null; headsign: string | null } {
  if (!schedule?.size) return { directionId: rec.d, headsign: rec.hs };
  const trip = rec.tripId ? schedule.get(rec.tripId) : undefined;
  if (!trip) return { directionId: null, headsign: null };
  return { directionId: trip.d, headsign: resolveDisplayHeadsign(trip.h, route.shortName, route.displayName || null) };
}
