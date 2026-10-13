/**
 * Stop counts and agency-to-agency connections for the agency pages, computed locally from each agency's
 * published route file (its Point features are the stops). Pure: no network, no files.
 *
 * - Stop count: unique places, not platforms. Stops with the same name within CLUSTER_M of each other count once,
 *   so a station's several platforms or bays are one stop.
 * - Connection: another agency's stop within CONNECT_M of one of this agency's stops. The release carries no parent
 *   station ids, so distance is the only rule. Routes are the other agency's routes that serve those stops.
 */
/** Short label for a connecting route: "19 Hamilton/Toronto" for a numbered route, the long name for a lettered code ("LW" -> "Lakeshore West"). */
export function connectionLabel(short: string | null, long: string | null): string {
  if (!long) return short ?? '';
  if (!short) return long;
  const s = short.length > 1 && /^0+\d/.test(short) ? short.replace(/^0+/, '') : short;
  if (long.toLowerCase().startsWith(s.toLowerCase())) return long;
  return /^\d+[A-Za-z]?$/.test(s) ? `${s} ${long}` : long;
}

export const CONNECT_M = 150;
export const CLUSTER_M = 150;

type Feature = { geometry: { type: string; coordinates?: unknown }; properties: Record<string, unknown> };

/** A compact copy of one agency's stops, small enough to keep for every agency at once. */
export interface AgencyStops {
  lon: number[];
  lat: number[];
  /** Per stop, indexes into `routes` (the route labels serving it). */
  rt: number[][];
  routes: string[];
}

export interface AgencyConnection {
  slug: string;
  name: string;
  routes: string[];
}

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

function metres(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dx = (lon1 - lon2) * M_PER_DEG_LON * Math.cos((lat1 * Math.PI) / 180);
  const dy = (lat1 - lat2) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Unique stops (same-name stops within CLUSTER_M merge) and the compact stop list used for connections. */
export function extractStops(features: Feature[]): { stopCount: number; stops: AgencyStops } {
  const labels = new Map<string, string>();
  for (const f of features) {
    if (f.geometry?.type !== 'LineString') continue;
    const p = f.properties;
    const id = String(p.routeId ?? '');
    if (!id || labels.has(id)) continue;
    const short = typeof p.routeShortName === 'string' ? p.routeShortName.trim() : '';
    const long = typeof p.routeLongName === 'string' ? p.routeLongName.trim() : '';
    labels.set(id, connectionLabel(short || null, long || null) || id);
  }
  const routes: string[] = [];
  const routeIndex = new Map<string, number>();
  const stops: AgencyStops = { lon: [], lat: [], rt: [], routes };
  const centres = new Map<string, Array<[number, number]>>();
  let stopCount = 0;
  for (const f of features) {
    if (f.geometry?.type !== 'Point') continue;
    const c = f.geometry.coordinates as [number, number] | undefined;
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lon, lat] = c;
    const idx: number[] = [];
    for (const id of (f.properties.routeIds as string[] | undefined) ?? []) {
      const label = labels.get(String(id));
      if (!label) continue;
      let i = routeIndex.get(label);
      if (i === undefined) { i = routes.push(label) - 1; routeIndex.set(label, i); }
      if (!idx.includes(i)) idx.push(i);
    }
    stops.lon.push(lon); stops.lat.push(lat); stops.rt.push(idx);
    const name = String(f.properties.stopName ?? f.properties.stopId ?? '').trim().toLowerCase();
    const near = centres.get(name) ?? [];
    if (!near.some(([x, y]) => metres(lon, lat, x, y) <= CLUSTER_M)) { near.push([lon, lat]); stopCount++; }
    centres.set(name, near);
  }
  return { stopCount, stops };
}

/**
 * For each target slug, the other agencies with a stop within CONNECT_M, with the routes serving those stops.
 * Agencies come from `all`, so a run limited to a few targets must load their neighbours into `all` first.
 */
export function computeConnections(
  all: ReadonlyMap<string, AgencyStops>,
  targets: Iterable<string>,
  nameOf: (slug: string) => string,
): Map<string, AgencyConnection[]> {
  const CELL = CONNECT_M;
  const cellKey = (lon: number, lat: number): [number, number] => [
    Math.floor((lon * M_PER_DEG_LON * Math.cos((lat * Math.PI) / 180)) / CELL),
    Math.floor((lat * M_PER_DEG_LAT) / CELL),
  ];
  const grid = new Map<string, Array<[string, number]>>();
  for (const [slug, s] of all) {
    for (let i = 0; i < s.lon.length; i++) {
      const [x, y] = cellKey(s.lon[i], s.lat[i]);
      const k = `${x},${y}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push([slug, i]);
    }
  }
  const out = new Map<string, AgencyConnection[]>();
  for (const slug of targets) {
    const s = all.get(slug);
    if (!s) continue;
    const found = new Map<string, Set<string>>();
    for (let i = 0; i < s.lon.length; i++) {
      const [x, y] = cellKey(s.lon[i], s.lat[i]);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const [other, j] of grid.get(`${x + dx},${y + dy}`) ?? []) {
          if (other === slug) continue;
          const o = all.get(other)!;
          if (metres(s.lon[i], s.lat[i], o.lon[j], o.lat[j]) > CONNECT_M) continue;
          const set = found.get(other) ?? found.set(other, new Set()).get(other)!;
          for (const r of o.rt[j]) set.add(o.routes[r]);
        }
      }
    }
    out.set(slug, [...found.entries()]
      .map(([other, set]) => ({ slug: other, name: nameOf(other), routes: [...set].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) }))
      .sort((a, b) => b.routes.length - a.routes.length || a.name.localeCompare(b.name)));
  }
  return out;
}
