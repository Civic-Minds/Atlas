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
 * Each hub arrival's wait for the next local departure. A departure in the same minute counts
 * (no walking-time allowance: that would be a cut-off). Only the same service day is read, so a
 * late arrival with nothing after it reads "no local bus", not the next morning's first trip.
 * Arrivals come back in time order.
 */
export function connectionWaits(arrivals: readonly HubArrival[], departures: readonly LocalDeparture[]): ConnectionWait[] {
  const deps = [...departures].sort((a, b) => a.time - b.time || a.distanceM - b.distanceM);
  return [...arrivals].sort((a, b) => a.time - b.time).map(arrival => {
    const next = firstAtOrAfter(deps, arrival.time);
    return { arrival, next, waitMin: next ? Math.round(next.time - arrival.time) : null };
  });
}

function firstAtOrAfter(sorted: readonly LocalDeparture[], time: number): LocalDeparture | null {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return sorted[lo] ?? null;
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
