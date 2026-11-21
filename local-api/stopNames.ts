import { getAgencyDataUrl } from '../shared/config.js';

/**
 * Stop names by stop id for an agency, from its published stops file (the one the map's stops come from), for the Live
 * vehicle card's Next stop (CIV-2024). Read once per agency and kept; a failed read is retried after a few minutes.
 * A stop the file doesn't have gives no name, so the card leaves the row out rather than show a number.
 */
const KEEP_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; ok: boolean; names: Promise<Map<string, string>> }>();

async function load(slug: string): Promise<Map<string, string>> {
  const res = await fetch(getAgencyDataUrl(slug, '-stops'));
  if (!res.ok) throw new Error(`stops file ${res.status}`);
  const stops = await res.json() as Record<string, { name?: string } | undefined>;
  const names = new Map<string, string>();
  for (const [id, s] of Object.entries(stops)) if (s?.name) names.set(id, s.name);
  return names;
}

export function stopNames(slug: string, now = Date.now()): Promise<Map<string, string>> {
  const hit = cache.get(slug);
  if (hit && now - hit.at < (hit.ok ? KEEP_MS : RETRY_MS)) return hit.names;
  const entry = { at: now, ok: true, names: load(slug).catch(() => { entry.ok = false; return new Map<string, string>(); }) };
  cache.set(slug, entry);
  return entry.names;
}
