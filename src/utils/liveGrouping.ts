import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { compareRouteNumber } from '../../shared/sortCompare';
import { projectOntoSegment } from '../../shared/geoDistance';
import { directionBranchFallback } from '../../shared/headsignDisplay';
import { feedPlaceName } from './nameCase';
import { streetJoin } from './stopLabel';
import { metresBetween } from '../../shared/geoDistance';
import { SAME_STOP_M } from '../../shared/rules/live';

/** Live's route list order: by agency slug, then route number in natural order ("2" < "10", "7A" < "7B"). */
export function compareLiveRoutes(
  a: { agencySlug: string; routeShortName: string },
  b: { agencySlug: string; routeShortName: string },
): number {
  if (a.agencySlug !== b.agencySlug) return a.agencySlug.localeCompare(b.agencySlug);
  return compareRouteNumber(a.routeShortName, b.routeShortName);
}

/** The group for a vehicle whose direction cannot be told (it sits on track both directions share). */
export const DIRECTION_UNCLEAR = 'Direction unclear';

/** Rough length of a route shape (first to last point of its longest part), to tell a full route from a short turn. */
export function featureSpan(f: GeoJSON.Feature): number {
  const g = f.geometry;
  if (!g || (g.type !== 'LineString' && g.type !== 'MultiLineString')) return 0;
  const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  let best = 0;
  for (const part of parts) {
    if (part.length < 2) continue;
    const [x1, y1] = part[0];
    const [x2, y2] = part[part.length - 1];
    best = Math.max(best, Math.hypot(x2 - x1, y2 - y1));
  }
  return best;
}

/** The words a stop name starts with, before " at " ("Broadview Station at Bay 7" → ["broadview", "station"]). */
const placeWords = (name: string) => name.split(/ at /i)[0].toLowerCase().split(/\s+/).filter(Boolean);
/** The destination's words lead the stop's ("Broadview" leads "Broadview Station", "Dufferin Gate" leads "Dufferin Gate Loop"). */
const leads = (destination: string, stop: string | undefined) => {
  if (!stop) return false;
  const d = destination.toLowerCase().split(/\s+/), s = placeWords(stop);
  return d.length <= s.length && d.every((w, i) => w === s[i]);
};

/** Every word of the destination ("Broadview & Gerrard": broadview, gerrard) is in one of the route's stop names. */
function namesAStop(destination: string, stopNames: readonly string[]): boolean {
  const words = destination.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 1 && w !== 'and');
  return words.length > 0 && stopNames.some(n => { const own = new Set(n.toLowerCase().split(/[^a-z0-9']+/)); return words.every(w => own.has(w)); });
}

/**
 * Whether a destination short of its direction's end is a short turn or a branch, from the route's Live analysis
 * (its run-time patterns, each "main", "branch" or "shortTurn", keyed by the analysis's own direction, and its stop
 * names). A destination that leads a main end ("High Park" for "High Park Loop") is an end, not a short turn. On a
 * route with no branch, any other destination that names one of the route's stops is a short turn. On a route with
 * a branch it is a branch only when its name leads exactly one branch end in a direction. Anything less clear
 * ("Replacement Bus", an end the analysis names differently) is null and the card shows no tag (CIV-1043: a wrong
 * label is worse than none).
 */
export function destinationKind(
  patterns: Readonly<Record<string, ReadonlyArray<{ kind: string; fromName?: string; toName?: string }>>> | null | undefined,
  destination: string,
  stopNames: readonly string[] = [],
): 'shortTurn' | 'branch' | null {
  const dirs = Object.values(patterns ?? {});
  if (!dirs.some(list => list.length)) return null;
  const hit = (p: { fromName?: string; toName?: string }) => leads(destination, p.fromName) || leads(destination, p.toName);
  if (dirs.some(list => list.some(p => p.kind === 'main' && hit(p)))) return null;
  if (!dirs.some(list => list.some(p => p.kind === 'branch'))) return namesAStop(destination, stopNames) ? 'shortTurn' : null;
  const branchHits = dirs.map(list => list.filter(p => p.kind === 'branch' && hit(p)).length);
  return branchHits.some(n => n > 1) || !branchHits.some(n => n === 1) ? null : 'branch';
}

/**
 * A timetable headsign a rider can read, or null when it's an internal name like "506 Carlton Short Turn" (the route
 * number, maybe with one letter, then "Short Turn"): that names no stop, so the car shows its direction only (CIV-1062).
 */
export function riderHeadsign(headsign: string | null | undefined, routeShortName: string): string | null {
  if (!headsign) return null;
  const raw = headsign.trim().toLowerCase();
  const own = raw.split(' ')[0];
  // The route number may carry one letter ("88S South Leaside Short Turn" on route 88).
  const number = own === routeShortName.toLowerCase() || (own.slice(0, -1) === routeShortName.toLowerCase() && /[a-z]$/.test(own));
  // CIV-2915: a destination the feed sends in capitals reads in normal case ("HAMILTON GO CENTRE" -> "Hamilton GO Centre").
  return number && raw.endsWith(' short turn') ? null : feedPlaceName(headsign);
}

/** Each direction named by its longest shape's headsign (a short turn never names a direction). */
export function routeDirectionLabels(features: readonly GeoJSON.Feature[], routeShortName: string): Map<number, string> {
  const labels = new Map<number, string>();
  const span = new Map<number, number>();
  for (const f of features) {
    const p = f.properties as Record<string, unknown> | null;
    if (!p || p.routeShortName !== routeShortName) continue;
    if (p.directionId == null || !p.headsign) continue;
    const dir = Number(p.directionId);
    const len = featureSpan(f);
    if (len > (span.get(dir) ?? -1)) { span.set(dir, len); labels.set(dir, feedPlaceName(String(p.headsign))); }
  }
  return labels;
}

/**
 * Group a route's vehicles by destination. A vehicle's own headsign wins; otherwise its direction is named by the route's
 * main destination for that direction. A vehicle whose direction cannot be told goes in the DIRECTION_UNCLEAR group, so
 * every vehicle is always in exactly one group (none is dropped).
 */
export function groupVehiclesByDirection(vehicles: readonly LiveVehicle[], directionLabels: ReadonlyMap<number, string>): Map<string, LiveVehicle[]> {
  const groups = new Map<string, LiveVehicle[]>();
  const keys = destinationKeys(vehicles, directionLabels);
  for (const v of vehicles) {
    const key = keys.get(v.id) ?? vehicleDirectionKey(v, directionLabels);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(v);
  }
  return groups;
}

/**
 * The Live direction group a route card's destination row stands for (#1877): its shape's headsign, named the way a
 * vehicle's is, so the row can carry that destination's vehicles. Null for a row with no headsign or a short turn.
 */
export function rowDirectionKey(headsign: unknown, routeShortName: string): string | null {
  const name = typeof headsign === 'string' ? riderHeadsign(headsign, routeShortName) : null;
  return name ? streetJoin(name) : null;
}

/**
 * #1877 (Ryan: the same destination listed again under another name): which destination each vehicle's trip really goes
 * to. Vehicles whose trips end at the same stop (the timetable's last stop, within SAME_STOP_M, same direction) are one
 * destination, named by the headsign most of them carry when that is where most of that headsign's vehicles end (TTC 505's
 * "Broadview Ave" trips ending at Broadview Station join "Broadview"); a stop no headsign mainly ends at keeps the stop's
 * own name. Vehicles with no known last stop keep their headsign group (vehicleDirectionKey).
 */
export function destinationKeys(vehicles: readonly Pick<LiveVehicle, 'id' | 'headsign' | 'directionId' | 'lastStop'>[], directionLabels: ReadonlyMap<number, string>): Map<string, string> {
  const out = new Map<string, string>();
  interface End { dir: number | null; at: readonly [number, number]; name: string; ids: string[]; heads: Map<string, number> }
  const ends: End[] = [];
  for (const v of vehicles) {
    const base = vehicleDirectionKey(v, directionLabels);
    out.set(v.id, base);
    const last = v.lastStop;
    if (!last?.lonLat || v.headsign == null) continue;
    let end = ends.find(e => e.dir === v.directionId && metresBetween({ lon: e.at[0], lat: e.at[1] }, { lon: last.lonLat[0], lat: last.lonLat[1] }) < SAME_STOP_M);
    if (!end) ends.push(end = { dir: v.directionId, at: last.lonLat, name: last.name, ids: [], heads: new Map() });
    end.ids.push(v.id);
    end.heads.set(base, (end.heads.get(base) ?? 0) + 1);
  }
  // Each headsign's own end: the stop most of its vehicles end at.
  const home = new Map<string, End>();
  for (const e of ends) for (const [h, n] of e.heads) { const at = home.get(h); if (!at || n > (at.heads.get(h) ?? 0)) home.set(h, e); }
  for (const e of ends) {
    const own = [...e.heads].filter(([h]) => home.get(h) === e).sort((a, b) => b[1] - a[1]);
    const name = own.length ? own[0][0] : e.name;
    for (const id of e.ids) out.set(id, name);
  }
  return out;
}

/** The direction group a vehicle belongs to (see groupVehiclesByDirection). */
export function vehicleDirectionKey(v: Pick<LiveVehicle, 'headsign' | 'directionId'>, directionLabels: ReadonlyMap<number, string>): string {
  return v.headsign
    ?? (v.directionId != null ? (directionLabels.get(v.directionId) ?? directionBranchFallback(v.directionId)) : DIRECTION_UNCLEAR);
}

/**
 * The direction a Live selection narrows to: the picked direction row, else the direction of the vehicle whose card
 * is open, else none (the whole route).
 */
export function focusDirectionKey(
  selectedDirection: string | null,
  cardVehicle: Pick<LiveVehicle, 'headsign' | 'directionId'> | null,
  directionLabels: ReadonlyMap<number, string>,
): string | null {
  return selectedDirection ?? (cardVehicle ? vehicleDirectionKey(cardVehicle, directionLabels) : null);
}

/**
 * The direction groups in a fixed order, so the list doesn't reshuffle between polls: direction 0's
 * groups, then direction 1's (each direction's main destination before its short turns), then groups
 * whose vehicles carry no direction id, each set alphabetically, and DIRECTION_UNCLEAR always last.
 */
export function orderDirectionGroups(groups: ReadonlyMap<string, LiveVehicle[]>, directionLabels: ReadonlyMap<number, string>): [string, LiveVehicle[]][] {
  const rank = (key: string, vehicles: readonly LiveVehicle[]): [number, number, number] => {
    if (key === DIRECTION_UNCLEAR) return [1, 0, 0];
    const ids = vehicles.map(v => v.directionId).filter((d): d is number => d != null);
    const dir = ids.length > 0 ? Math.min(...ids) : Number.MAX_SAFE_INTEGER;
    const main = directionLabels.get(dir) === key || (Number.isFinite(dir) && key === directionBranchFallback(dir)) ? 0 : 1;
    return [0, dir, main];
  };
  return [...groups.entries()]
    .map(entry => ({ entry, r: rank(entry[0], entry[1]) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.entry[0].localeCompare(b.entry[0]))
    .map(x => x.entry);
}

const ALONG_MAX_OFF_LINE_M = 1_200;

/** Metres from the line's start to the point on it nearest (lat, lon); null when the line is more than 1.2 km away. */
export function metresAlongLine(parts: readonly (readonly number[])[][], lat: number, lon: number): number | null {
  let walked = 0, best = Infinity, bestAlong: number | null = null;
  for (const part of parts) {
    for (let i = 0; i < part.length - 1; i++) {
      const { t, offM, lenM } = projectOntoSegment({ lat, lon }, part[i], part[i + 1]);
      if (offM < best) { best = offM; bestAlong = walked + t * lenM; }
      walked += lenM;
    }
  }
  return best <= ALONG_MAX_OFF_LINE_M ? bestAlong : null;
}

/**
 * A route's vehicles in order along the route, first stop to last (Ryan, CIV-1125): direction 0 before direction 1,
 * each vehicle placed on its direction's main line (the longest shape, as routeDirectionLabels picks) by how far it
 * has gone. A vehicle with no direction, or too far from the line to place, goes last, in the order it came.
 */
export function orderAlongRoute<V extends Pick<LiveVehicle, 'lat' | 'lon' | 'directionId'>>(vehicles: readonly V[], features: readonly GeoJSON.Feature[], routeShortName: string): V[] {
  const lines = new Map<number, { span: number; parts: number[][][] }>();
  for (const f of features) {
    const p = f.properties as Record<string, unknown> | null;
    const g = f.geometry;
    if (!p || p.routeShortName !== routeShortName || p.directionId == null || !g) continue;
    if (g.type !== 'LineString' && g.type !== 'MultiLineString') continue;
    const dir = Number(p.directionId), span = featureSpan(f);
    if (span > (lines.get(dir)?.span ?? -1)) lines.set(dir, { span, parts: g.type === 'LineString' ? [g.coordinates] : g.coordinates });
  }
  const placed = vehicles.map((v, i) => {
    const line = v.directionId == null ? undefined : lines.get(v.directionId);
    const along = line ? metresAlongLine(line.parts, v.lat, v.lon) : null;
    return { v, i, dir: along == null ? Infinity : v.directionId!, along: along ?? Infinity };
  });
  return placed.sort((a, b) => a.dir - b.dir || a.along - b.along || a.i - b.i).map(x => x.v);
}
