/**
 * CIV-437: LA Metro rail History, uploaded beside the published bus History without touching it.
 *
 * Rail is a supplemental feed. A bus+rail rebuild would write new bus sidecars (changing published bus values) and
 * collide with the published bus-only sidecars (20241214, 20251213, 20261212). Instead each rail period gets its own
 * rail-only sidecar and shapes file, under its own period key: the rail feed's own reference date (YYYYMMDD), so
 * the key dates the rail values exactly (config/history-period-remaps.json compares period keys as dates).
 *
 * build-history joins sidecars to routes by key and period, so a rail-only file adds rail routes and leaves every
 * bus route alone, as long as its period key is used by nothing else of the agency's: a shared key would let the
 * rail file's date re-date bus trip-time files (sidecarRefDates) or drop bus change files with it (holidayDropFor).
 * The upload therefore refuses a rail-only period key that any other archive file of the agency uses.
 *
 * Approvals are listed by ticket, each for exactly one agency. Pure: no R2 access.
 */
import type { HistoryV2SidecarRoute } from '../shared/historyV2.js';

/** Ticket -> the one agency slug whose rail-only upload it approves (Ryan, CIV-437, 2026-11-20: "1"). */
export const APPROVED_RAIL_ONLY: Readonly<Record<string, string>> = {
  'CIV-437': 'lacmta',
};

/** Throws unless `ticket` approves a rail-only upload for exactly `slug`. */
export function assertRailOnlyApproved(ticket: string, slug: string): void {
  if (!Object.prototype.hasOwnProperty.call(APPROVED_RAIL_ONLY, ticket)) {
    throw new Error(`--rail-only ${ticket}: no such approval (known: ${Object.keys(APPROVED_RAIL_ONLY).join(', ')})`);
  }
  if (APPROVED_RAIL_ONLY[ticket] !== slug) throw new Error(`--rail-only ${ticket} covers only ${APPROVED_RAIL_ONLY[ticket]}, not ${slug}`);
}

const YMD = /^\d{8}$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * From a bus+rail build of one period, the rail feed's part only: its routes (the keys the build attributes to
 * `railUrl` in supplementalRoutes, never a main-feed key), keyed by the rail feed's reference date. Values are the
 * merged build's, untouched.
 */
export function railOnlyPart(
  routes: Record<string, HistoryV2SidecarRoute>,
  supplementalRoutes: Record<string, string[]> | undefined,
  railUrl: string,
  railRefDate: string,
): { periodKey: string; refDate: string; routes: Record<string, HistoryV2SidecarRoute>; supplementalRoutes: Record<string, string[]> } {
  if (!YMD.test(railRefDate)) throw new Error(`rail reference date must be YYYYMMDD, got "${railRefDate}"`);
  const keys = [...(supplementalRoutes?.[railUrl] ?? [])].filter(k => routes[k] !== undefined).sort();
  if (keys.length === 0) throw new Error(`the build attributes no routes to ${railUrl}`);
  return {
    periodKey: railRefDate,
    refDate: railRefDate,
    routes: Object.fromEntries(keys.map(k => [k, routes[k]])),
    supplementalRoutes: { [railUrl]: keys },
  };
}

/**
 * Checks a local file is a rail-only sidecar: its period key is its refDate (YYYYMMDD), it lists its routes under
 * supplementalRoutes for one of the agency's supplemental feed URLs, and holds those routes and no others.
 * Returns an error message, or null.
 */
export function checkRailOnlySidecar(input: unknown, railUrls: readonly string[]): string | null {
  if (!isObj(input) || !isObj(input.routes)) return 'not a sidecar (no routes object)';
  const periodKey = input.periodKey;
  if (typeof periodKey !== 'string' || !YMD.test(periodKey)) return `periodKey must be YYYYMMDD (got ${String(periodKey)})`;
  if (input.refDate !== periodKey) return `periodKey ${periodKey} must be the rail refDate (${String(input.refDate)})`;
  const supp = input.supplementalRoutes;
  if (!isObj(supp) || Object.keys(supp).length === 0) return 'no supplementalRoutes: not a rail-only sidecar';
  const listed = new Set<string>();
  for (const [url, keys] of Object.entries(supp)) {
    if (!railUrls.includes(url)) return `supplementalRoutes names ${url}, not one of this agency's supplemental feeds`;
    if (!Array.isArray(keys)) return `supplementalRoutes[${url}] is not a list`;
    for (const k of keys) listed.add(String(k));
  }
  const routeKeys = Object.keys(input.routes);
  const extra = routeKeys.filter(k => !listed.has(k));
  if (extra.length) return `${extra.length} route(s) not from a supplemental feed (first: ${extra[0]})`;
  const missing = [...listed].filter(k => !routeKeys.includes(k));
  if (missing.length) return `supplementalRoutes lists ${missing.length} route(s) the file lacks (first: ${missing[0]})`;
  return null;
}

/**
 * Every period key the agency's archive files use, from a listing of the archive: change files
 * history/{slug}/{route}/{pk}.json, trip-time files trip-duration/{slug}/{route}/{pk}.json, sidecars
 * history-v2/{slug}/{pk}.json and shapes history-v2-shapes/{slug}/{pk}.json. Maps each key to the files using it.
 */
export function periodKeysInUse(keys: readonly string[], slug: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const key of keys) {
    const parts = key.split('/');
    if (parts[1] !== slug || !key.endsWith('.json')) continue;
    const routeLevel = (parts[0] === 'history' || parts[0] === 'trip-duration') && parts.length >= 4;
    const periodLevel = (parts[0] === 'history-v2' || parts[0] === 'history-v2-shapes') && parts.length === 3;
    if (!routeLevel && !periodLevel) continue;
    const pk = parts[parts.length - 1].replace(/\.json$/, '');
    const list = out.get(pk);
    if (list) list.push(key); else out.set(pk, [key]);
  }
  return out;
}

/** The archive prefixes periodKeysInUse reads, for one agency. */
export const periodKeyPrefixes = (slug: string): string[] => [`history/${slug}/`, `trip-duration/${slug}/`, `history-v2/${slug}/`, `history-v2-shapes/${slug}/`];
