import type { GtfsData } from '../../types/gtfs.js';

/**
 * CIV-1334: the City of St. George's own SunTran feed (GTFS_2025-10-13) labels every route
 * "Route" and puts the number in the long name ("5 Ivins"). Atlas groups lines by short name,
 * so Routes 4, 5 and 6 (same direction, same end stop, same Sunset Corner departures) folded
 * into one line. Choices approved by Ryan (_reports/civ-1334-st-george-names.md):
 * - A1: the route number becomes the short name, the feed's long name is kept ("5" / "Ivins");
 *   a long name starting "Route " loses it ("Route Zion Route" -> "Zion Route").
 * - B1: a trailing transfer note is dropped from stop names ("Deseret Industries 865 North
 *   2450 East (Route 1 Transfer to Route 7)" read as the headsign "Route 7)").
 * - C1: other stop names, addresses included, stay as the feed has them.
 * - D1: the "Transfer Announcement" stops, placed on top of a terminal as each loop's last stop,
 *   become that terminal (the nearest stop where trips start), so the loops stay whole.
 */
export const TRANSFER_ANNOUNCEMENT = 'Transfer Announcement';
/** A "Transfer Announcement" stop farther than this from every trip-start stop is left as it is. */
export const MAX_TERMINAL_METERS = 400;

function meters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const x = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

export interface StGeorgeLabelResult {
  gtfs: GtfsData;
  renamedRoutes: number;
  renamedStops: number;
  /** "Transfer Announcement" stop id -> the terminal stop id it now reads as. */
  mappedStops: Record<string, string>;
  /** "Transfer Announcement" stops with no trip-start stop near enough; left unchanged. */
  unmappedStops: string[];
}

export function normalizeStGeorgeLabels(gtfs: GtfsData): StGeorgeLabelResult {
  let renamedRoutes = 0;
  const routes = (gtfs.routes ?? []).map(route => {
    const short = route.route_short_name?.trim() ?? '';
    const long = route.route_long_name?.trim() ?? '';
    const numbered = /^(\d+)\s+(\S.*)$/.exec(long);
    if (short.toLowerCase() === 'route' && numbered) {
      renamedRoutes++;
      return { ...route, route_short_name: numbered[1], route_long_name: numbered[2] };
    }
    const prefixed = /^route\s+(\S.*)$/i.exec(long);
    if (short && short.toLowerCase() !== 'route' && prefixed) {
      renamedRoutes++;
      return { ...route, route_long_name: prefixed[1] };
    }
    return route;
  });

  let renamedStops = 0;
  const stops = (gtfs.stops ?? []).map(stop => {
    const name = stop.stop_name?.trim() ?? '';
    const cut = name.replace(/\s*\([^()]*\btransfer\b[^()]*\)\s*$/i, '');
    if (cut === name || !cut) return stop;
    renamedStops++;
    return { ...stop, stop_name: cut };
  });

  // Trip-start stops: the terminals a loop's "Transfer Announcement" stands for.
  const firstStop = new Map<string, { seq: number; stopId: string }>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = Number(st.stop_sequence);
    const cur = firstStop.get(st.trip_id);
    if (!cur || seq < cur.seq) firstStop.set(st.trip_id, { seq, stopId: st.stop_id });
  }
  const byId = new Map(stops.map(s => [s.stop_id, s]));
  const announcement = new Set(stops.filter(s => s.stop_name?.trim() === TRANSFER_ANNOUNCEMENT).map(s => s.stop_id));
  const terminals = [...new Set([...firstStop.values()].map(f => f.stopId))]
    .filter(id => !announcement.has(id) && byId.has(id));
  const mappedStops: Record<string, string> = {};
  const unmappedStops: string[] = [];
  for (const id of [...announcement].sort()) {
    const s = byId.get(id)!;
    let best: { id: string; m: number } | null = null;
    for (const t of terminals) {
      const ts = byId.get(t)!;
      const m = meters(Number(s.stop_lat), Number(s.stop_lon), Number(ts.stop_lat), Number(ts.stop_lon));
      if (Number.isFinite(m) && (!best || m < best.m)) best = { id: t, m };
    }
    if (best && best.m <= MAX_TERMINAL_METERS) mappedStops[id] = best.id;
    else unmappedStops.push(id);
  }
  const mapped = new Set(Object.keys(mappedStops));
  return {
    gtfs: {
      ...gtfs,
      routes,
      stops: mapped.size ? stops.filter(s => !mapped.has(s.stop_id)) : stops,
      stopTimes: mapped.size
        ? (gtfs.stopTimes ?? []).map(st => (mapped.has(st.stop_id) ? { ...st, stop_id: mappedStops[st.stop_id] } : st))
        : gtfs.stopTimes,
    },
    renamedRoutes,
    renamedStops,
    mappedStops,
    unmappedStops,
  };
}
