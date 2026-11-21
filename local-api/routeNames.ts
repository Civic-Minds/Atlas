import { getAgencyDataUrl } from '../shared/config.js';

/**
 * Route names by GTFS route_id for an agency, from its published route file (the one the map draws), for an agency the
 * Live map shows from the archiver's feed (CIV-2046), which has no polled-route config naming its routes. Read once per
 * agency and kept; a failed read is retried after a few minutes.
 */
const KEEP_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
export type RouteName = { shortName: string; displayName: string };
const cache = new Map<string, { at: number; ok: boolean; names: Promise<Map<string, RouteName>> }>();

async function load(slug: string): Promise<Map<string, RouteName>> {
  const res = await fetch(getAgencyDataUrl(slug));
  if (!res.ok) throw new Error(`route file ${res.status}`);
  const data = await res.json() as { features?: Array<{ properties?: { routeId?: string; routeShortName?: string; routeLongName?: string } }> };
  const names = new Map<string, RouteName>();
  for (const f of data.features ?? []) {
    const p = f.properties;
    if (!p?.routeId || names.has(p.routeId)) continue;
    const short = p.routeShortName?.trim() || p.routeLongName?.trim() || p.routeId;
    names.set(p.routeId, { shortName: short, displayName: p.routeShortName?.trim() ? p.routeLongName?.trim() ?? '' : '' });
  }
  return names;
}

export function routeNames(slug: string, now = Date.now()): Promise<Map<string, RouteName>> {
  const hit = cache.get(slug);
  if (hit && now - hit.at < (hit.ok ? KEEP_MS : RETRY_MS)) return hit.names;
  const entry = { at: now, ok: true, names: load(slug).catch(() => { entry.ok = false; return new Map<string, RouteName>(); }) };
  cache.set(slug, entry);
  return entry.names;
}
