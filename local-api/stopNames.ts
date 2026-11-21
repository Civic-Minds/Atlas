import { getAgencyDataUrl } from '../shared/config.js';

/**
 * Stop names by stop id for an agency, from its published stops file (the one the map's stops come from), for the Live
 * vehicle card's Next stop (CIV-2024). Read once per agency and kept; a failed read is retried after a few minutes.
 * A stop the file doesn't have gives no name, so the card leaves the row out rather than show a number.
 */
const KEEP_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; ok: boolean; names: Promise<Map<string, string>> }>();
/** CIV-2047: each stop's place ([lon, lat]), read in the same pass, for where a trip ends. */
const places = new Map<string, Map<string, [number, number]>>();

async function load(slug: string): Promise<Map<string, string>> {
  const res = await fetch(getAgencyDataUrl(slug, '-stops'));
  if (!res.ok) throw new Error(`stops file ${res.status}`);
  const stops = await res.json() as Record<string, { name?: string; lat?: number; lon?: number } | undefined>;
  const names = new Map<string, string>();
  const at = new Map<string, [number, number]>();
  for (const [id, s] of Object.entries(stops)) {
    if (s?.name) names.set(id, s.name);
    if (s && Number.isFinite(s.lat) && Number.isFinite(s.lon)) at.set(id, [s.lon!, s.lat!]);
  }
  places.set(slug, at);
  return names;
}

/** A stop's place once the agency's file is read (stopNames first), else undefined. */
export const stopPlace = (slug: string, stopId: string): [number, number] | undefined => places.get(slug)?.get(stopId);

export function stopNames(slug: string, now = Date.now()): Promise<Map<string, string>> {
  const hit = cache.get(slug);
  if (hit && now - hit.at < (hit.ok ? KEEP_MS : RETRY_MS)) return hit.names;
  const entry = { at: now, ok: true, names: load(slug).catch(() => { entry.ok = false; return new Map<string, string>(); }) };
  cache.set(slug, entry);
  return entry.names;
}
