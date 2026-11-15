/**
 * Connection data for one hub agency (CIV-101; CIV-1353 for any agency): src/data/connections/<hub>.json, built by
 * scripts/build-bustang-connections.ts --hub <slug> from the shared calculation in shared/connections.ts. Loaded only
 * when a view needs it, so the map's own code never carries it. Every wait and count shown comes from this file as
 * built. Bustang is the only hub built so far.
 */
import { useEffect, useState } from 'react';
import type { DayType } from '../../shared/dayTypes';
import { BAR_DISTANCE_CHOICES, type ConnectionSide, type NearbyChoice, type RouteConnection } from '../../shared/connections';
import { agencyTodayYmd, isExpiredFeedExpiry } from '../../shared/feedAvailability';
import { metresBetween } from '../../shared/geoDistance';
import { MAP_EXPORT_TITLES } from '../content/noticeCopy';

/** Keyed by distance; a file built before a distance was added has no entry for it. */
type ByChoice<T> = Partial<Record<`${NearbyChoice}`, T>>;

export interface BustangAgency { name: string; feedVersion: string | null; feedExpiry: string | null }

export interface BustangStopDay {
  hubDate: string;
  readDates: Record<string, string>;
  arrivals: number;
  departures: number;
  routes: ByChoice<{ after: RouteConnection[]; before: RouteConnection[] }>;
}

export interface BustangStop {
  id: string;
  stopIds: string[];
  name: string;
  lat: number;
  lon: number;
  agencies: ByChoice<string[]>;
  days: Record<DayType, BustangStopDay>;
}

/** A local route meeting one hub bus at one stop: [route index, then the wait at each of the file's nearbyChoices] (null: not within). */
export type TripRouteWaits = [number, ...(number | null)[]];

export interface BustangTripStop {
  stop: number;
  arrival: number;
  departure: number;
  /** Getting off Bustang here; null where riders can't get off. */
  after: TripRouteWaits[] | null;
  /** Catching Bustang here; null where riders can't get on. */
  before: TripRouteWaits[] | null;
}

export interface BustangTrip {
  id: string;
  routeId: string;
  routeName: string;
  headsign: string | null;
  stops: BustangTripStop[];
}

export interface BustangData {
  builtFrom: string;
  /** The distances this file was built for, in the order each trip stop's waits are listed. */
  nearbyChoices: number[];
  hub: BustangAgency & { slug: string; timezone?: string | null };
  dates: Record<DayType, string>;
  agencies: Record<string, BustangAgency>;
  stops: BustangStop[];
  /** [agency slug, route name] by index. */
  routes: Array<[string, string]>;
  trips: Record<DayType, BustangTrip[]>;
}

/** The research view's list title, also the back link of a route opened from it. */
export const BUSTANG_LIST_TITLE = 'Bustang routes';
export const BUSTANG_INFO_HEADING = MAP_EXPORT_TITLES.bustang;
/** Where the view's map opens without a place in its link: Bustang's stops, Grand Junction to Denver ([south, west, north, east]). */
export const BUSTANG_MAP_BOUNDS: [number, number, number, number] = [38.75, -108.65, 40.65, -104.7];
/** The view's distance choice in its link (?within=800); 400, the default, is left out. */
export const BUSTANG_WITHIN_PARAM = 'within';

const DATA_FILES = import.meta.glob<{ default: unknown }>('../data/connections/*.json');
const cached = new Map<string, Promise<BustangData>>();
/** The hubs with built connection data. */
export const CONNECTION_HUBS = Object.keys(DATA_FILES).map(p => p.replace(/^.*\/(.+)\.json$/, '$1'));
export function loadConnectionData(hub: string): Promise<BustangData> {
  const load = DATA_FILES[`../data/connections/${hub}.json`];
  if (!load) return Promise.reject(new Error(`no connection data for ${hub}`));
  let p = cached.get(hub);
  if (!p) { p = load().then(m => m.default as BustangData); cached.set(hub, p); }
  return p;
}

/** A hub's data once a view needs it (null until it loads, and for a hub with no built data). */
export function useConnectionData(hub: string | null): BustangData | null {
  const [data, setData] = useState<BustangData | null>(null);
  useEffect(() => {
    if (!hub || !CONNECTION_HUBS.includes(hub)) { setData(null); return; }
    let live = true;
    loadConnectionData(hub).then(d => { if (live) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, [hub]);
  return data;
}

/** The Bustang view's data (null until it opens and loads). */
export function useBustangData(active: boolean): BustangData | null {
  return useConnectionData(active ? 'bustang' : null);
}

/** The agencies the view draws: Bustang and every local agency at its stops. */
export function bustangMapSlugs(data: BustangData | null): string[] {
  return data ? [...new Set([data.hub.slug, ...Object.keys(data.agencies)])] : ['bustang'];
}

/** A schedule has ended, judged in the hub's local date (Colorado for a file built before the hub's zone was kept), as on the map. */
export function scheduleEnded(agency: BustangAgency, timezone: string | null | undefined = 'America/Denver'): boolean {
  return isExpiredFeedExpiry(agency.feedExpiry, agencyTodayYmd({ timezone: timezone ?? 'America/Denver' }));
}

/** The Bustang stop a picked map stop belongs to: one of its own stop ids, else a Bustang stop within 150 m. */
export function bustangStopFor(
  data: BustangData,
  stop: { siblingIdsByAgency?: Record<string, Set<string>>; agencySlug?: string; stopId?: string; lat?: number; lon?: number },
): BustangStop | null {
  const ids = new Set(stop.siblingIdsByAgency?.[data.hub.slug] ?? []);
  if (stop.agencySlug === data.hub.slug && stop.stopId) ids.add(stop.stopId);
  if (ids.size === 0) return null;
  const byId = data.stops.find(s => s.stopIds.some(id => ids.has(id)) || ids.has(s.id));
  if (byId) return byId;
  if (stop.lat == null || stop.lon == null) return null;
  const here = { lat: stop.lat, lon: stop.lon };
  const nearest = data.stops
    .map(s => ({ s, d: metresBetween(s, here) }))
    .sort((a, b) => a.d - b.d)[0];
  return nearest && nearest.d <= 150 ? nearest.s : null;
}

/** A route's trips on the day, in departure order. */
export function tripsForRoute(data: BustangData, day: DayType, routeId: string): BustangTrip[] {
  return data.trips[day].filter(t => t.routeId === routeId);
}

/** The wait for the chosen distance from a trip stop's row; null when not within it, or the file has no such distance. */
export function waitWithin(data: Pick<BustangData, 'nearbyChoices'>, row: TripRouteWaits, within: number): number | null {
  const i = data.nearbyChoices.indexOf(within);
  return i < 0 ? null : row[1 + i] ?? null;
}

/** Whether the file was built for a distance (a 600 m choice needs a rebuild of files built before it). */
export function hasDistance(data: Pick<BustangData, 'nearbyChoices'>, meters: number): boolean {
  return data.nearbyChoices.includes(meters);
}

/** The time the bar's trip list shows for a trip: its arrival at its last stop when arriving, else its departure from its first. */
export function tripListTime(trip: BustangTrip, side: ConnectionSide): number {
  return side === 'after' ? trip.stops[trip.stops.length - 1].arrival : trip.stops[0].departure;
}

/** A route's trips grouped by where each starts and where it goes ("Grand Junction Regional Airport to Denver"). */
export function tripDirections(data: BustangData, trips: BustangTrip[]): Array<[string, BustangTrip[]]> {
  const groups = new Map<string, BustangTrip[]>();
  for (const t of trips) {
    const from = data.stops[t.stops[0].stop].name;
    const k = t.headsign ? `${from} to ${t.headsign}` : `From ${from}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups];
}

/**
 * The local routes that meet one hub trip within `waitMin` on one side, at any of its stops, with a local stop within
 * `meters`: [agency slug, route name], sorted. Getting off ('after') reads each stop where riders can get off;
 * catching ('before') each stop where they can get on.
 */
export function tripConnectingRoutes(data: BustangData, trip: BustangTrip, side: ConnectionSide, meters: number, waitMin: number): Array<[string, string]> {
  const found = new Map<number, [string, string]>();
  for (const stop of trip.stops) {
    for (const row of stop[side] ?? []) {
      const wait = waitWithin(data, row, meters);
      if (wait !== null && wait <= waitMin) found.set(row[0], data.routes[row[0]]);
    }
  }
  return [...found.values()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1], undefined, { numeric: true }));
}

/**
 * The map's route keys (agency::routeId) for routes named as the connection data names them ([agency slug, route
 * name], the route's short name, else its long name), from the loaded agency layers. Unloaded agencies give none.
 */
export function routeKeysForNames(layers: Record<string, GeoJSON.FeatureCollection>, names: Array<[string, string]>): string[] {
  const keys = new Set<string>();
  const bySlug = new Map<string, Set<string>>();
  for (const [slug, name] of names) bySlug.set(slug, (bySlug.get(slug) ?? new Set()).add(name));
  for (const [slug, wanted] of bySlug) {
    for (const f of layers[slug]?.features ?? []) {
      const p = f.properties as { routeId?: string; routeShortName?: string | null; routeLongName?: string | null } | null;
      const name = (p?.routeShortName || p?.routeLongName || p?.routeId || '').trim();
      if (p?.routeId && wanted.has(name)) keys.add(`${slug}::${p.routeId}`);
    }
  }
  return [...keys].sort();
}

/** The bar's distances a hub's file was built for (all of them while no file is loaded). */
export function barDistancesFor(data: Pick<BustangData, 'nearbyChoices'> | null): number[] {
  return BAR_DISTANCE_CHOICES.filter(m => !data || hasDistance(data, m));
}
