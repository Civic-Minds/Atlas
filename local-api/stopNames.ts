import { getAgencyDataUrl } from '../shared/config.js';

/**
 * Stop names and places by stop id for an agency, from its published stops file (the one the map's stops come from), for the Live
 * vehicle card's Next stop (CIV-2024) and each vehicle's pattern (CIV-2047). Read once per agency and kept; a failed read is retried after a few minutes.
 * A stop the file doesn't have gives no name, so the card leaves the row out rather than show a number.
 */
const KEEP_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
/** A stop's name and [lon, lat] (CIV-2047: a live vehicle's upcoming stops are matched by both). */
export interface StopPlace { name: string; lonLat: [number, number] | null }
const cache = new Map<string, { at: number; ok: boolean; places: Promise<Map<string, StopPlace>> }>();

async function load(slug: string): Promise<Map<string, StopPlace>> {
  const res = await fetch(getAgencyDataUrl(slug, '-stops'));
  if (!res.ok) throw new Error(`stops file ${res.status}`);
  const stops = await res.json() as Record<string, { name?: string; lat?: number; lon?: number } | undefined>;
  const places = new Map<string, StopPlace>();
  for (const [id, s] of Object.entries(stops)) {
    if (s?.name) places.set(id, { name: s.name, lonLat: Number.isFinite(s.lat) && Number.isFinite(s.lon) ? [s.lon!, s.lat!] : null });
  }
  return places;
}


export function stopPlaces(slug: string, now = Date.now()): Promise<Map<string, StopPlace>> {
  const hit = cache.get(slug);
  if (hit && now - hit.at < (hit.ok ? KEEP_MS : RETRY_MS)) return hit.places;
  const entry = { at: now, ok: true, places: load(slug).catch(() => { entry.ok = false; return new Map<string, StopPlace>(); }) };
  cache.set(slug, entry);
  return entry.places;
}
