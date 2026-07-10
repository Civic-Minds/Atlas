/**
 * stopsMeta.ts — derive per-stop facts (routes served, direction of travel)
 * from a parsed GTFS feed, for export as atlas/{slug}-stops-meta.json.
 *
 * Consumers (e.g. Transit Stats) use this as a read-only facts layer: official
 * stop names are exported verbatim, direction is only asserted when the
 * schedule overwhelmingly agrees, and nothing here modifies the feed.
 *
 * Direction rules (mirrors Transit Stats Tools/backfill-stop-metadata.js):
 *  - tally direction words from trip_headsign prefixes across every scheduled
 *    visit to the stop ("East - 10 Van Horne...", "Northbound to ...", "NB ...")
 *  - assert a direction only when >= 90% of recognized visits agree
 *  - a side-of-street suffix in the official stop name ("... South Side")
 *    vetoes a contradicting headsign majority; it is also used as a fallback
 *    when headsigns carry no direction words at all
 */
import type { GtfsData } from '../types/gtfs.js';

export interface StopMetaEntry {
  code: string | null;
  id: string;
  name: string; // verbatim GTFS stop_name — never normalized
  lat: number | null;
  lon: number | null;
  routes: string[]; // route_short_names, most-served first
  direction?: 'Northbound' | 'Southbound' | 'Eastbound' | 'Westbound';
}

export interface StopsMetaFile {
  generatedAt: string;
  stopCount: number;
  stops: StopMetaEntry[];
}

const DIR_WORD: Record<string, StopMetaEntry['direction']> = {
  north: 'Northbound', south: 'Southbound', east: 'Eastbound', west: 'Westbound',
  nb: 'Northbound', sb: 'Southbound', eb: 'Eastbound', wb: 'Westbound',
};

const DIRECTION_AGREEMENT = 0.9;

/** Direction word at the start of a headsign: "East - 10 ...", "Northbound to ...", "NB via ..." */
export function headsignDirection(headsign: string | undefined): StopMetaEntry['direction'] | null {
  const m = /^(north|south|east|west|nb|sb|eb|wb)(?:bound)?\b/i.exec((headsign ?? '').trim());
  return m ? DIR_WORD[m[1].toLowerCase()] : null;
}

/** Side-of-street suffix in an official stop name: "... at X St South Side" */
export function nameSuffixDirection(name: string | undefined): StopMetaEntry['direction'] | null {
  const m = /\b(north|south|east|west)\s*side\b/i.exec(name ?? '');
  return m ? DIR_WORD[m[1].toLowerCase()] : null;
}

export function buildStopsMeta(gtfs: GtfsData): StopsMetaFile {
  const routeShortName = new Map<string, string>();
  for (const r of gtfs.routes ?? []) {
    if (r.route_short_name) routeShortName.set(r.route_id, r.route_short_name);
  }

  const tripInfo = new Map<string, { route: string | undefined; dir: StopMetaEntry['direction'] | null }>();
  for (const t of gtfs.trips ?? []) {
    tripInfo.set(t.trip_id, {
      route: routeShortName.get(t.route_id),
      dir: headsignDirection(t.trip_headsign),
    });
  }

  // One pass over stop_times: per stop, tally routes and headsign directions
  const tallies = new Map<string, { routes: Map<string, number>; dirs: Map<string, number> }>();
  for (const st of gtfs.stopTimes ?? []) {
    const info = tripInfo.get(st.trip_id);
    if (!info) continue;
    let tally = tallies.get(st.stop_id);
    if (!tally) {
      tally = { routes: new Map(), dirs: new Map() };
      tallies.set(st.stop_id, tally);
    }
    if (info.route) tally.routes.set(info.route, (tally.routes.get(info.route) ?? 0) + 1);
    if (info.dir) tally.dirs.set(info.dir, (tally.dirs.get(info.dir) ?? 0) + 1);
  }

  const stops: StopMetaEntry[] = [];
  for (const stop of gtfs.stops ?? []) {
    const tally = tallies.get(stop.stop_id);
    if (!tally) continue; // unserved stop (entrances, unused records)

    const routes = [...tally.routes.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
    const dirs = [...tally.dirs.entries()].sort((a, b) => b[1] - a[1]);
    const total = dirs.reduce((n, [, c]) => n + c, 0);
    const majority = total > 0 && dirs[0][1] / total >= DIRECTION_AGREEMENT
      ? (dirs[0][0] as StopMetaEntry['direction'])
      : null;
    const suffix = nameSuffixDirection(stop.stop_name);

    let direction: StopMetaEntry['direction'] | null = majority;
    if (majority && suffix && majority !== suffix) direction = null; // signals disagree — assert nothing
    if (!direction && total === 0 && suffix) direction = suffix; // no headsign signal at all — trust the name

    const lat = Number.parseFloat(stop.stop_lat);
    const lon = Number.parseFloat(stop.stop_lon);
    stops.push({
      code: stop.stop_code?.trim() || null,
      id: stop.stop_id,
      name: stop.stop_name,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      routes,
      ...(direction ? { direction } : {}),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    stopCount: stops.length,
    stops,
  };
}
