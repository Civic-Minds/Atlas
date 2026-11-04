/**
 * Connection waits between two agencies (CIV-101, Bustang connection check).
 *
 * One agency is the "hub" (Bustang): riders get off one of its buses. The other agencies' stops
 * within NEARBY_METERS are the local side: the wait is the time until the next local departure
 * that day, at any of those stops, on any route. There is no minutes cut-off and no pass/fail
 * (DECISIONS.md "No fixed cut-offs"): the real wait is shown, and an arrival with no local bus
 * after it that day is ranked worst. The build step and the research page both read waits and
 * ranks from these functions only, so the list, the detail table and any summary agree.
 */
import { haversineM } from './shapeProjection.js';

/** "Nearby" (Ryan, 2026-11-03): within 400 m in a straight line by default. Labelled by distance, never "connects". */
export const NEARBY_METERS = 400;
/** The distances a reader can pick (Ryan, 2026-11-03: 200, 400 and 800 m, starting at 400). Each is precomputed. */
export const NEARBY_CHOICES = [200, 400, 800] as const;
export type NearbyChoice = (typeof NEARBY_CHOICES)[number];
/** The widest choice: the build reads every stop within it once, then each choice keeps the ones within its own distance. */
export const MAX_NEARBY_METERS = Math.max(...NEARBY_CHOICES);

/** A URL value as one of the choices, else the default. */
export function parseNearbyChoice(value: string | null | undefined): NearbyChoice {
  const n = Number(value);
  return (NEARBY_CHOICES as readonly number[]).includes(n) ? (n as NearbyChoice) : NEARBY_METERS;
}

/** The departures from stops within `meters` (a stop exactly at the distance counts). */
export function departuresWithin<T extends { distanceM: number }>(departures: readonly T[], meters: number): T[] {
  return departures.filter(d => d.distanceM <= meters);
}

/** A hub bus a rider can get off: minutes after the service day's midnight (can pass 24:00). */
export interface HubArrival {
  time: number;
  routeName: string;
  headsign?: string | null;
}

/** A local bus a rider can board at a nearby stop. */
export interface LocalDeparture {
  time: number;
  agencySlug: string;
  routeName: string;
  headsign?: string | null;
  stopName: string;
  distanceM: number;
}

export interface ConnectionWait {
  arrival: HubArrival;
  /** The first local departure at or after the arrival that service day; null when there is none. */
  next: LocalDeparture | null;
  /** Minutes from arrival to that departure; null when there is no local bus after this arrival. */
  waitMin: number | null;
}

/** Straight-line distance in metres. */
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineM(a.lat, a.lon, b.lat, b.lon);
}

export function isNearby(a: { lat: number; lon: number }, b: { lat: number; lon: number }, meters = NEARBY_METERS): boolean {
  return distanceMeters(a, b) <= meters;
}

/** GTFS "HH:MM:SS" (hours may pass 24) to minutes after midnight; null when blank or malformed. */
export function gtfsTimeToMinutes(value: string | null | undefined): number | null {
  const m = /^\s*(\d{1,3}):(\d{2})(?::(\d{2}))?\s*$/.exec(value ?? '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 60;
}

/**
 * The two sides of a connection (CIV-101, Ryan 2026-11-04):
 * - 'after': getting off Bustang. Each Bustang arrival's wait for the next local departure.
 * - 'before': catching Bustang. Each Bustang departure's wait back to the last local bus that
 *   dropped riders off before it (the time a rider stands at the stop waiting for Bustang).
 * Both are the same search: 'before' runs it on the times mirrored (negated), so a same-minute
 * match counts on both sides and neither side reaches into another service day.
 */
export type ConnectionSide = 'after' | 'before';

/**
 * Each hub bus's wait to the nearest local bus on the given side. A local bus in the same minute
 * counts (no walking-time allowance: that would be a cut-off). Only the same service day is read,
 * so a late arrival with nothing after it reads "no local bus", not the next morning's first trip.
 * On the 'after' side `arrivals` are Bustang arrivals and `departures` local departures; on the
 * 'before' side they are Bustang departures and local drop-offs. Hub buses come back in time order.
 */
export function connectionWaits(arrivals: readonly HubArrival[], departures: readonly LocalDeparture[], side: ConnectionSide = 'after'): ConnectionWait[] {
  const sign = side === 'after' ? 1 : -1;
  // Ties at one minute go to the closer stop on both sides.
  const deps = [...departures].sort((a, b) => sign * (a.time - b.time) || a.distanceM - b.distanceM);
  const mirrored = deps.map(d => sign * d.time);
  return [...arrivals].sort((a, b) => a.time - b.time).map(arrival => {
    const i = firstAtOrAfter(mirrored, sign * arrival.time);
    const next = i < deps.length ? deps[i] : null;
    return { arrival, next, waitMin: next ? Math.round(sign * (next.time - arrival.time)) || 0 : null };
  });
}

/** The index of the first sorted time at or after `time` (the list's length when there is none). */
function firstAtOrAfter(sorted: readonly number[], time: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The groups a route is placed in (Ryan, 2026-11-04: "within 15 mins, 30 mins, 60 mins"). */
export const CONNECTION_WINDOWS = [15, 30, 60] as const;
export type ConnectionWindow = (typeof CONNECTION_WINDOWS)[number];

/** One local route at a Bustang stop, on one side: how many Bustang trips it meets within each window. */
export interface RouteConnection {
  agencySlug: string;
  routeName: string;
  /** Bustang trips on this side that day (the "of 8"). */
  trips: number;
  /** Trips this route meets within 15, 30 and 60 min, in that order (each counts the ones before it too). */
  within: [number, number, number];
  /** The nearby stop the route most often meets Bustang at, and its distance. */
  stopName: string;
  distanceM: number;
}

/**
 * Every local route near a stop, on one side, from the same connectionWaits as the per-trip table:
 * each route's waits are read on that route's buses alone, at any of its nearby stops and in either
 * direction. Routes come back best first (most trips within 15, then 30, then 60 min), then by name.
 */
export function routeConnections(hub: readonly HubArrival[], local: readonly LocalDeparture[], side: ConnectionSide): RouteConnection[] {
  const byRoute = new Map<string, LocalDeparture[]>();
  for (const d of local) {
    const key = `${d.agencySlug}\u0000${d.routeName}`;
    const list = byRoute.get(key);
    if (list) list.push(d); else byRoute.set(key, [d]);
  }
  const out: RouteConnection[] = [];
  for (const list of byRoute.values()) {
    const waits = connectionWaits(hub, list, side);
    const within = CONNECTION_WINDOWS.map(w => waits.filter(x => x.waitMin !== null && x.waitMin <= w).length) as RouteConnection['within'];
    const stops = new Map<string, { n: number; distanceM: number }>();
    for (const w of waits) if (w.next && w.waitMin !== null && w.waitMin <= CONNECTION_WINDOWS[CONNECTION_WINDOWS.length - 1]) {
      const s = stops.get(w.next.stopName);
      stops.set(w.next.stopName, { n: (s?.n ?? 0) + 1, distanceM: Math.min(s?.distanceM ?? Infinity, w.next.distanceM) });
    }
    const nearest = [...list].sort((a, b) => a.distanceM - b.distanceM)[0];
    const [stopName, stop] = [...stops].sort((a, b) => b[1].n - a[1].n || a[1].distanceM - b[1].distanceM)[0] ?? [nearest.stopName, { distanceM: nearest.distanceM }];
    out.push({ agencySlug: list[0].agencySlug, routeName: list[0].routeName, trips: hub.length, within, stopName, distanceM: stop.distanceM });
  }
  return out.sort((a, b) => b.within[0] - a.within[0] || b.within[1] - a.within[1] || b.within[2] - a.within[2]
    || a.routeName.localeCompare(b.routeName, undefined, { numeric: true }) || a.agencySlug.localeCompare(b.agencySlug));
}

/**
 * A route's best group: the tightest window it meets at least one Bustang trip within, with the
 * count in that window ("within 15 min for 6 of 8 Bustang trips"). Null when it meets none within 60.
 */
export function bestWindow(route: Pick<RouteConnection, 'within' | 'trips'>): { window: ConnectionWindow; count: number; of: number } | null {
  const i = route.within.findIndex(n => n > 0);
  return i < 0 ? null : { window: CONNECTION_WINDOWS[i], count: route.within[i], of: route.trips };
}

/** A stop's map colour group, from its worst wait (the same summary the ranking reads). */
export type WaitGroup = ConnectionWindow | 'longer';
export function worstWaitGroup(summary: StopWaitSummary): WaitGroup | null {
  if (summary.arrivals === 0) return null;
  if (summary.noBusAfter > 0 || summary.longestWaitMin === null) return 'longer';
  return CONNECTION_WINDOWS.find(w => summary.longestWaitMin! <= w) ?? 'longer';
}

/** A stop's figures for one day type, all from its waits. */
export interface StopWaitSummary {
  arrivals: number;
  /** Arrivals with no local bus after them that day. */
  noBusAfter: number;
  /** Longest real wait among arrivals that have a local bus after them; null when none do. */
  longestWaitMin: number | null;
  /** Median real wait among those arrivals; null when none do. */
  medianWaitMin: number | null;
}

export function summarizeWaits(waits: readonly ConnectionWait[]): StopWaitSummary {
  const finite = waits.map(w => w.waitMin).filter((w): w is number => w !== null).sort((a, b) => a - b);
  const mid = finite.length >> 1;
  return {
    arrivals: waits.length,
    noBusAfter: waits.length - finite.length,
    longestWaitMin: finite.length ? finite[finite.length - 1] : null,
    medianWaitMin: finite.length ? (finite.length % 2 ? finite[mid] : Math.round((finite[mid - 1] + finite[mid]) / 2)) : null,
  };
}

/**
 * Worst first: more arrivals with no local bus after them, then the longer longest wait, then the
 * longer median wait. A stop with no arrivals that day sorts last. No cut-off is applied.
 */
export function compareStopsWorstFirst(a: StopWaitSummary, b: StopWaitSummary): number {
  if ((a.arrivals === 0) !== (b.arrivals === 0)) return a.arrivals === 0 ? 1 : -1;
  return (b.noBusAfter - a.noBusAfter)
    || ((b.longestWaitMin ?? -1) - (a.longestWaitMin ?? -1))
    || ((b.medianWaitMin ?? -1) - (a.medianWaitMin ?? -1));
}

/** Rank items worst first by their waits. Stable for ties. */
export function rankWorstFirst<T>(items: readonly T[], waitsOf: (item: T) => readonly ConnectionWait[]): Array<{ item: T; summary: StopWaitSummary }> {
  return items
    .map((item, i) => ({ item, summary: summarizeWaits(waitsOf(item)), i }))
    .sort((a, b) => compareStopsWorstFirst(a.summary, b.summary) || a.i - b.i)
    .map(({ item, summary }) => ({ item, summary }));
}
