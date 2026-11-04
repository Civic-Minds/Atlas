/**
 * The Bustang connections research view's data (CIV-101, beta only): src/data/bustangConnections.json, built by
 * scripts/build-bustang-connections.ts from the shared calculation in shared/connections.ts. Loaded only when the
 * view opens, so the map's own code never carries it. Every wait and count shown comes from this file as built.
 */
import { useEffect, useState } from 'react';
import type { DayType } from '../../shared/dayTypes';
import { NEARBY_CHOICES, distanceMeters, type NearbyChoice, type RouteConnection } from '../../shared/connections';
import { agencyTodayYmd, isExpiredFeedExpiry } from '../../shared/feedAvailability';

type ByChoice<T> = Record<`${NearbyChoice}`, T>;

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

/** A local route meeting one Bustang bus at one stop: [route index, wait at 200, 400 and 800 m] (null: not within). */
export type TripRouteWaits = [number, number | null, number | null, number | null];

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
  hub: BustangAgency & { slug: string };
  dates: Record<DayType, string>;
  agencies: Record<string, BustangAgency>;
  stops: BustangStop[];
  /** [agency slug, route name] by index. */
  routes: Array<[string, string]>;
  trips: Record<DayType, BustangTrip[]>;
}

/** The research view's list title, also the back link of a route opened from it. */
export const BUSTANG_LIST_TITLE = 'Bustang routes';
export const BUSTANG_INFO_HEADING = 'Bustang connections';
/** Where the view's map opens without a place in its link: Bustang's stops, Grand Junction to Denver ([south, west, north, east]). */
export const BUSTANG_MAP_BOUNDS: [number, number, number, number] = [38.75, -108.65, 40.65, -104.7];
/** The view's distance choice in its link (?within=800); 400, the default, is left out. */
export const BUSTANG_WITHIN_PARAM = 'within';

let cached: Promise<BustangData> | null = null;
export function loadBustangData(): Promise<BustangData> {
  cached ??= import('../data/bustangConnections.json').then(m => m.default as unknown as BustangData);
  return cached;
}

/** The data once the view has been opened (null until it loads). */
export function useBustangData(active: boolean): BustangData | null {
  const [data, setData] = useState<BustangData | null>(null);
  useEffect(() => {
    if (!active || data) return;
    let live = true;
    loadBustangData().then(d => { if (live) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, [active, data]);
  return data;
}

/** The agencies the view draws: Bustang and every local agency at its stops. */
export function bustangMapSlugs(data: BustangData | null): string[] {
  return data ? [data.hub.slug, ...Object.keys(data.agencies)] : ['bustang'];
}

const DENVER = { timezone: 'America/Denver' };
/** A schedule has ended, judged in Colorado's local date, as on the map. */
export function scheduleEnded(agency: BustangAgency): boolean {
  return isExpiredFeedExpiry(agency.feedExpiry, agencyTodayYmd(DENVER));
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
    .map(s => ({ s, d: distanceMeters(s, here) }))
    .sort((a, b) => a.d - b.d)[0];
  return nearest && nearest.d <= 150 ? nearest.s : null;
}

/** A route's trips on the day, in departure order. */
export function tripsForRoute(data: BustangData, day: DayType, routeId: string): BustangTrip[] {
  return data.trips[day].filter(t => t.routeId === routeId);
}

/** The wait for the chosen distance from a trip stop's row. */
export function waitWithin(row: TripRouteWaits, within: NearbyChoice): number | null {
  return row[1 + NEARBY_CHOICES.indexOf(within)];
}
