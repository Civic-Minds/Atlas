/**
 * GTFS Import Pipeline
 *
 * Orchestrates the full flow for importing a GTFS ZIP into the static database:
 *   1. Parse ZIP → structured GTFS data
 *   2. Upsert agency_account + gtfs_agency
 *   3. Create feed_version record
 *   4. Write routes, stops, trips, calendar to DB
 *   5. Build route shapes from shape points
 *   6. Run phase1 + phase2 frequency analysis
 *   7. Write route_frequency_results
 *   8. Mark version as current + complete
 *
 * All writes happen within a single transaction. On failure, nothing is committed.
 */

import crypto from 'crypto';
import { PoolClient } from 'pg';
import { getStaticPool } from '../storage/static-db';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { parseGtfsBuffer, parseStopTimesForCorridors, ParsedGtfs, GtfsCalendar, GtfsCalendarDate } from './parse-gtfs';
import { log } from '../logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImportOptions {
  /** Buffer containing the GTFS ZIP */
  zipBuffer: Buffer;
  /** Original filename, e.g. "Toronto Transit Commission (TTC).zip" */
  filename: string;
  /** agency_account slug, e.g. "ttc" — created if not exists */
  accountSlug: string;
  /** Human-readable account name, e.g. "Toronto Transit Commission" */
  accountName: string;
  /** Optional label for this feed version, e.g. "Fall 2024" */
  label?: string;
  /** Country code ISO 3166-1 alpha-2, e.g. "CA" */
  countryCode?: string;
  /** Region/province/state, e.g. "Ontario" */
  region?: string;
}

export interface ImportResult {
  feedVersionId: string;
  agencyAccountId: string;
  gtfsAgencyId: string;
  routeCount: number;
  stopCount: number;
  tripCount: number;
  analysisResultCount: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const ALL_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
type DayName = typeof ALL_DAYS[number];
type DayType = 'Weekday' | 'Saturday' | 'Sunday';

const DAY_TO_TYPE: Record<DayName, DayType> = {
  Monday: 'Weekday', Tuesday: 'Weekday', Wednesday: 'Weekday',
  Thursday: 'Weekday', Friday: 'Weekday',
  Saturday: 'Saturday', Sunday: 'Sunday',
};

const DAY_FIELD: Record<DayName, keyof GtfsCalendar> = {
  Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday',
  Thursday: 'thursday', Friday: 'friday', Saturday: 'saturday', Sunday: 'sunday',
};

function detectReferenceDate(
  calendar: GtfsCalendar[],
  calendarDates: GtfsCalendarDate[],
  trips: Array<{ service_id: string }>
): string {
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

  if (calendar.length === 0) {
    const added = calendarDates.filter(cd => cd.exception_type === '1').map(cd => cd.date).sort();
    if (added.length > 0) {
      const first = added[0], last = added[added.length - 1];
      const midMs = (new Date(parseInt(first.slice(0,4)), parseInt(first.slice(4,6))-1, parseInt(first.slice(6,8))).getTime() +
                     new Date(parseInt(last.slice(0,4)), parseInt(last.slice(4,6))-1, parseInt(last.slice(6,8))).getTime()) / 2;
      const mid = new Date(midMs);
      return `${mid.getFullYear()}${String(mid.getMonth()+1).padStart(2,'0')}${String(mid.getDate()).padStart(2,'0')}`;
    }
    return todayStr;
  }

  const tripServiceIds = new Set(trips.map(t => t.service_id));
  const relevant = calendar.filter(c => tripServiceIds.has(c.service_id));
  const cal = relevant.length > 0 ? relevant : calendar;

  const groups = new Map<string, number>();
  for (const c of cal) groups.set(c.start_date, (groups.get(c.start_date) ?? 0) + 1);
  const sorted = Array.from(groups.entries()).sort((a,b) => b[0].localeCompare(a[0]));
  const multi = sorted.filter(([s, count]) => count > 1 && s <= todayStr);
  const chosen = multi[0]?.[0] ?? sorted[0]?.[0] ?? todayStr;

  // Use midpoint of the chosen period
  const periodCalendar = cal.filter(c => c.start_date === chosen);
  const ends = periodCalendar.map(c => c.end_date).sort();
  const endDate = ends[ends.length - 1] ?? chosen;
  const startMs = new Date(parseInt(chosen.slice(0,4)), parseInt(chosen.slice(4,6))-1, parseInt(chosen.slice(6,8))).getTime();
  const endMs   = new Date(parseInt(endDate.slice(0,4)), parseInt(endDate.slice(4,6))-1, parseInt(endDate.slice(6,8))).getTime();
  const mid = new Date((startMs + endMs) / 2);
  return `${mid.getFullYear()}${String(mid.getMonth()+1).padStart(2,'0')}${String(mid.getDate()).padStart(2,'0')}`;
}

function getActiveServiceIds(
  calendar: GtfsCalendar[],
  calendarDates: GtfsCalendarDate[],
  day: DayName,
  refDate: string
): Set<string> {
  const active = new Set<string>();
  const refNum = parseInt(refDate);

  const windowStart = refNum - 90;
  const windowEnd   = refNum + 90;

  const inWindow = (date: string) => {
    const n = parseInt(date);
    return n >= windowStart && n <= windowEnd;
  };

  // calendar.txt
  const calField = DAY_FIELD[day];
  for (const c of calendar) {
    if (c[calField] !== '1') continue;
    const start = parseInt(c.start_date), end = parseInt(c.end_date);
    if (start > refNum + 90 || end < refNum - 90) continue;
    active.add(c.service_id);
  }

  // calendar_dates.txt
  const exceptions = new Map<string, Map<string, string>>();
  for (const cd of calendarDates) {
    if (!inWindow(cd.date)) continue;
    if (!exceptions.has(cd.service_id)) exceptions.set(cd.service_id, new Map());
    exceptions.get(cd.service_id)!.set(cd.date, cd.exception_type);
  }

  for (const [sid, dates] of exceptions) {
    let addCount = 0;
    for (const [, type] of dates) {
      if (type === '1') addCount++;
    }
    if (addCount >= 2) {
      // Only include if this service runs on the right day-of-week
      // (check first added date)
      const addedDates = Array.from(dates.entries())
        .filter(([, t]) => t === '1')
        .map(([d]) => d)
        .sort();
      for (const dateStr of addedDates) {
        const y = parseInt(dateStr.slice(0,4)), m = parseInt(dateStr.slice(4,6))-1, d = parseInt(dateStr.slice(6,8));
        const dow = new Date(y, m, d).getDay(); // 0=Sun
        const dayOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow] as DayName;
        if (dayOfWeek === day) { active.add(sid); break; }
      }
    }
  }

  return active;
}

// ─── Phase 1: raw departures ──────────────────────────────────────────────────

function t2m(time: string | undefined): number | null {
  if (!time) return null;
  const parts = time.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0]), m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

interface RawDepartures {
  routeId: string;
  routeType: string;
  dirId: string;
  day: DayName;
  times: number[];
  serviceIds: string[];
  warnings: string[];
  serviceSpan: { start: number; end: number };
}

function computeRawDepartures(gtfs: ParsedGtfs, refDate: string): RawDepartures[] {
  const { routes, trips, tripFirstDep: rawTripFirstDep, calendar, calendarDates, frequencies } = gtfs;

  // Use pre-built tripFirstDep from streaming parser (avoids loading all stop_times into memory)
  const tripFirstDep = new Map<string, number>();
  for (const [tripId, { depTime }] of rawTripFirstDep) {
    tripFirstDep.set(tripId, depTime);
  }

  // Expand frequency-based trips
  const freqExpanded = new Map<string, number[]>();
  const byTrip = new Map<string, typeof frequencies>();
  for (const f of frequencies) {
    if (!byTrip.has(f.trip_id)) byTrip.set(f.trip_id, []);
    byTrip.get(f.trip_id)!.push(f);
  }
  for (const [tripId, freqs] of byTrip) {
    const deps: number[] = [];
    for (const f of freqs) {
      const start = t2m(f.start_time), end = t2m(f.end_time);
      const hw = parseInt(f.headway_secs);
      if (start === null || end === null || isNaN(hw) || hw < 60) continue;
      for (let s = start * 60; s < end * 60; s += hw) deps.push(s / 60);
    }
    if (deps.length > 0) freqExpanded.set(tripId, deps);
  }

  // Build tripData map
  interface TripData { depTime: number; routeId: string; dirId: string; serviceId: string; missingDir: boolean }
  const tripData = new Map<string, TripData>();
  for (const trip of trips) {
    const meta = {
      routeId: trip.route_id,
      dirId: trip.direction_id?.trim() || '0',
      serviceId: trip.service_id,
      missingDir: !trip.direction_id?.trim(),
    };
    const freqDeps = freqExpanded.get(trip.trip_id);
    if (freqDeps) {
      freqDeps.forEach((dep, i) => tripData.set(`${trip.trip_id}__f${i}`, { depTime: dep, ...meta }));
    } else {
      const dep = tripFirstDep.get(trip.trip_id);
      if (dep !== undefined) tripData.set(trip.trip_id, { depTime: dep, ...meta });
    }
  }

  const routeTypeById = new Map(routes.map(r => [r.route_id, r.route_type]));
  const results: RawDepartures[] = [];

  for (const day of ALL_DAYS) {
    const active = getActiveServiceIds(calendar, calendarDates, day, refDate);
    if (active.size === 0) continue;

    const grouped = new Map<string, { routeId: string; dirId: string; times: number[]; serviceIds: Set<string>; missingDir: boolean }>();
    for (const [, data] of tripData) {
      if (!active.has(data.serviceId)) continue;
      const key = `${data.routeId}::${data.dirId}`;
      if (!grouped.has(key)) grouped.set(key, { routeId: data.routeId, dirId: data.dirId, times: [], serviceIds: new Set(), missingDir: false });
      const g = grouped.get(key)!;
      g.times.push(data.depTime);
      g.serviceIds.add(data.serviceId);
      if (data.missingDir) g.missingDir = true;
    }

    for (const [, g] of grouped) {
      const sorted = [...new Set(g.times)].sort((a, b) => a - b);
      if (sorted.length < 2) continue;
      const warnings: string[] = [];
      if (g.missingDir) warnings.push('direction_id missing — all trips merged');
      results.push({
        routeId: g.routeId,
        routeType: routeTypeById.get(g.routeId) ?? '3',
        dirId: g.dirId,
        day,
        times: sorted,
        serviceIds: Array.from(g.serviceIds),
        warnings,
        serviceSpan: { start: sorted[0], end: sorted[sorted.length - 1] },
      });
    }
  }

  return results;
}

// ─── Phase 2: frequency analysis ─────────────────────────────────────────────

interface AnalysisResult {
  gtfsRouteId: string;
  dirId: string;
  dayType: DayType;
  daysIncluded: DayName[];
  tier: string;
  avgHeadway: number;
  medianHeadway: number;
  peakHeadway: number;
  baseHeadway: number;
  headwayVariance: number;
  serviceSpanStart: number;
  serviceSpanEnd: number;
  tripCount: number;
  reliabilityScore: number;
  consistencyScore: number;
  circuityIndex: number; // Added
  bunchingFactor: number;
  bunchingPenalty: number;
  outlierPenalty: number;
  peakWindowStart: number;
  peakWindowEnd: number;
  contributingServiceIds: string[];
  warnings: string[];
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function haversine(p1: [number, number], p2: [number, number]): number {
  const [lon1, lat1] = p1, [lon2, lat2] = p2;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function polylineLength(pts: Array<[number, number]>): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += haversine(pts[i - 1], pts[i]);
  return len;
}

function computeStats(times: number[]) {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const med = median(gaps);
  const variance = gaps.length > 1
    ? gaps.reduce((acc, h) => acc + (h - avg) ** 2, 0) / (gaps.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const bunched = gaps.filter(g => g < avg * 0.25).length;
  const bunchingFactor = bunched / (gaps.length || 1);
  const bunchingPenalty = bunchingFactor * 60;
  const significant = gaps.filter(g => g > avg * 1.5).length;
  const outlierPenalty = gaps.length ? (significant / gaps.length) * 40 : 0;
  const consistencyScore = avg > 0 ? Math.max(0, 100 - (stdDev / avg) * 50) : 0;
  const reliability = Math.max(0, consistencyScore - outlierPenalty - bunchingPenalty);
  const base = Math.max(...gaps, avg);

  // Peak 2-hour window
  let peakWindow = { start: times[0] ?? 0, end: (times[0] ?? 0) + 120 };
  let peakHeadway = avg;
  let maxDensity = 0;
  let right = 0;
  for (let left = 0; left < times.length; left++) {
    const windowEnd = times[left] + 120;
    while (right < times.length && times[right] <= windowEnd) right++;
    const count = right - left;
    if (count > maxDensity) {
      maxDensity = count;
      peakWindow = { start: times[left], end: windowEnd };
      const peakGaps = [];
      for (let j = left + 1; j < right; j++) peakGaps.push(times[j] - times[j - 1]);
      peakHeadway = peakGaps.length ? peakGaps.reduce((a, b) => a + b, 0) / peakGaps.length : avg;
    }
  }

  return { avg, med, peakHeadway, base, peakWindow, variance, bunchingFactor, bunchingPenalty, outlierPenalty, consistencyScore, reliability };
}

const TIERS = [10, 15, 20, 30, 60];
const GRACE = 5;
const MAX_GRACE = 2;
const TIME_WINDOW = { start: 420, end: 1320 }; // 7am–10pm

function determineTier(gaps: number[], tripCount: number, spanMins: number): string {
  for (const T of TIERS) {
    const minTrips = Math.ceil(spanMins / T);
    if (tripCount < minTrips) continue;
    let graceCount = 0, fail = false;
    for (const h of gaps) {
      if (h <= T) continue;
      if (h <= T + GRACE) { if (++graceCount > MAX_GRACE) { fail = true; break; } }
      else { fail = true; break; }
    }
    if (!fail) return String(T);
  }
  return 'span';
}

function applyAnalysis(rawData: RawDepartures[], circuityMap: Map<string, number>): AnalysisResult[] {
  // Per-day results
  const perDay = new Map<string, { dayType: DayType; day: DayName; result: {
    gtfsRouteId: string; dirId: string; dayType: DayType; day: DayName;
    times: number[]; serviceIds: string[]; warnings: string[];
    serviceSpan: { start: number; end: number };
    tier: string; tripCount: number; stats: ReturnType<typeof computeStats>;
  }}>();

  for (const raw of rawData) {
    const dayType = DAY_TO_TYPE[raw.day];
    const windowed = raw.times.filter(t => t >= TIME_WINDOW.start && t <= TIME_WINDOW.end);
    if (windowed.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < windowed.length; i++) gaps.push(windowed[i] - windowed[i - 1]);
    const spanMins = windowed[windowed.length - 1] - windowed[0];
    const tier = determineTier(gaps, windowed.length, spanMins);
    const stats = computeStats(windowed);
    perDay.set(`${raw.routeId}::${raw.dirId}::${raw.day}`, {
      dayType, day: raw.day,
      result: { gtfsRouteId: raw.routeId, dirId: raw.dirId, dayType, day: raw.day,
        times: windowed, serviceIds: raw.serviceIds, warnings: raw.warnings,
        serviceSpan: raw.serviceSpan, tier, tripCount: windowed.length, stats },
    });
  }

  // Roll up into day-type summaries
  const rollup = new Map<string, typeof perDay extends Map<string, infer V> ? V[] : never>();
  for (const [, entry] of perDay) {
    const key = `${entry.result.gtfsRouteId}::${entry.result.dirId}::${entry.dayType}`;
    if (!rollup.has(key)) (rollup as any).set(key, []);
    (rollup as any).get(key).push(entry);
  }

  const results: AnalysisResult[] = [];
  for (const [, entries] of rollup as any as Map<string, Array<{ dayType: DayType; day: DayName; result: any }>>) {
    if (entries.length === 0) continue;
    const tierVals = entries.map((e: any) => e.result.tier === 'span' ? Infinity : parseInt(e.result.tier));
    const worstTier = Math.max(...tierVals) === Infinity ? 'span' : String(Math.max(...tierVals));
    const allTimes = [...new Set(entries.flatMap((e: any) => e.result.times))].sort((a: number, b: number) => a - b);
    const stats = computeStats(allTimes);
    const avgTrips = Math.round(entries.reduce((s: number, e: any) => s + e.result.tripCount, 0) / entries.length);
    const allServiceIds = [...new Set(entries.flatMap((e: any) => e.result.serviceIds))];
    const allWarnings = [...new Set(entries.flatMap((e: any) => e.result.warnings))];
    const daysIncluded = entries.map((e: any) => e.day as DayName);
    const allStarts = entries.map((e: any) => e.result.serviceSpan?.start ?? 0);
    const allEnds   = entries.map((e: any) => e.result.serviceSpan?.end ?? 0);
    const rep = entries[0].result;

    results.push({
      gtfsRouteId: rep.gtfsRouteId,
      dirId: rep.dirId,
      dayType: rep.dayType,
      daysIncluded,
      tier: worstTier,
      avgHeadway: Math.round(stats.avg),
      medianHeadway: Math.round(stats.med),
      peakHeadway: Math.round(stats.peakHeadway),
      baseHeadway: Math.round(stats.base),
      headwayVariance: Math.round(stats.variance * 10) / 10,
      serviceSpanStart: Math.min(...allStarts),
      serviceSpanEnd: Math.max(...allEnds),
      tripCount: avgTrips,
      reliabilityScore: Math.round(stats.reliability),
      consistencyScore: Math.round(stats.consistencyScore),
      circuityIndex: circuityMap.get(`${rep.gtfsRouteId}::${rep.dirId}`) ?? 1.0,
      bunchingFactor: Math.round(stats.bunchingFactor * 100) / 100,
      bunchingPenalty: Math.round(stats.bunchingPenalty),
      outlierPenalty: Math.round(stats.outlierPenalty),
      peakWindowStart: stats.peakWindow.start,
      peakWindowEnd: stats.peakWindow.end,
      contributingServiceIds: allServiceIds as string[],
      warnings: allWarnings as string[],
    });
  }

  return results;
}

// ─── Corridor analysis ────────────────────────────────────────────────────────

interface CorridorResult {
  linkId: string;
  stopA: string;
  stopB: string;
  routeIds: string[];
  routeCount: number;
  dayType: DayType;
  tripCount: number;
  avgHeadway: number;
  peakHeadway: number;
  reliabilityScore: number;
}

async function computeCorridors(
  zipBuffer: Buffer,
  gtfs: ParsedGtfs,
  refDate: string,
  windowStart: number,
  windowEnd: number,
): Promise<CorridorResult[]> {
  const tripToRoute = new Map(gtfs.trips.map(t => [t.trip_id, t.route_id]));

  // Union of all active trips across all day types — do one streaming pass
  const allActiveTripIds = new Set<string>();
  const activeByCombinedDay = new Map<DayType, Set<string>>();

  for (const day of ALL_DAYS) {
    const dayType = DAY_TO_TYPE[day];
    const active = getActiveServiceIds(gtfs.calendar, gtfs.calendarDates, day, refDate);
    if (!activeByCombinedDay.has(dayType)) activeByCombinedDay.set(dayType, new Set());
    for (const trip of gtfs.trips) {
      if (active.has(trip.service_id)) {
        allActiveTripIds.add(trip.trip_id);
        activeByCombinedDay.get(dayType)!.add(trip.trip_id);
      }
    }
  }

  if (allActiveTripIds.size === 0) return [];

  const links = await parseStopTimesForCorridors(zipBuffer, allActiveTripIds);

  const results: CorridorResult[] = [];

  for (const [dayType, activeTripIds] of activeByCombinedDay) {
    for (const [linkId, link] of links) {
      // Collect departure times per route for this day type, within time window
      const routeTimes = new Map<string, number[]>();
      for (const [tripId, depMins] of link.tripDeps) {
        if (!activeTripIds.has(tripId)) continue;
        if (depMins < windowStart || depMins > windowEnd) continue;
        const routeId = tripToRoute.get(tripId);
        if (!routeId) continue;
        if (!routeTimes.has(routeId)) routeTimes.set(routeId, []);
        routeTimes.get(routeId)!.push(depMins);
      }
      if (routeTimes.size < 2) continue;

      // Combined sorted departures across all routes
      const allTimes = Array.from(routeTimes.values())
        .flat()
        .sort((a, b) => a - b);
      if (allTimes.length < 2) continue;

      const gaps: number[] = [];
      for (let i = 1; i < allTimes.length; i++) gaps.push(allTimes[i] - allTimes[i - 1]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;

      // Peak 2-hour window headway
      let peakHeadway = avg;
      let maxDensity = 0;
      let right = 0;
      for (let left = 0; left < allTimes.length; left++) {
        const windowEnd2 = allTimes[left] + 120;
        while (right < allTimes.length && allTimes[right] <= windowEnd2) right++;
        const count = right - left;
        if (count > maxDensity) {
          maxDensity = count;
          const peakGaps: number[] = [];
          for (let j = left + 1; j < right; j++) peakGaps.push(allTimes[j] - allTimes[j - 1]);
          peakHeadway = peakGaps.length
            ? peakGaps.reduce((a, b) => a + b, 0) / peakGaps.length
            : avg;
        }
      }

      // Reliability: penalise variance
      const variance = gaps.length > 1
        ? gaps.reduce((acc, h) => acc + (h - avg) ** 2, 0) / (gaps.length - 1)
        : 0;
      const stdDev = Math.sqrt(variance);
      const consistencyScore = avg > 0 ? Math.max(0, 100 - (stdDev / avg) * 50) : 0;
      const significant = gaps.filter(g => g > avg * 1.5).length;
      const outlierPenalty = gaps.length ? (significant / gaps.length) * 40 : 0;
      const reliabilityScore = Math.max(0, consistencyScore - outlierPenalty);

      results.push({
        linkId,
        stopA: link.stopA,
        stopB: link.stopB,
        routeIds: Array.from(routeTimes.keys()),
        routeCount: routeTimes.size,
        dayType,
        tripCount: allTimes.length,
        avgHeadway: Math.round(avg * 10) / 10,
        peakHeadway: Math.round(peakHeadway * 10) / 10,
        reliabilityScore: Math.round(reliabilityScore),
      });
    }
  }

  return results;
}

// ─── Shape building ───────────────────────────────────────────────────────────

interface RouteShape {
  gtfsRouteId: string;
  dirId: string;
  sourceShapeId: string | null;
  coords: Array<[number, number]>; // [lon, lat]
  tripVoteCount: number;
  isSynthesised: boolean;
}

function buildRouteShapes(gtfs: ParsedGtfs): RouteShape[] {
  const { trips, shapePoints, stops } = gtfs;

  // Count votes per (routeId, dirId, shapeId)
  const votes = new Map<string, number>();
  for (const trip of trips) {
    if (!trip.shape_id) continue;
    const key = `${trip.route_id}::${trip.direction_id ?? '0'}::${trip.shape_id}`;
    votes.set(key, (votes.get(key) ?? 0) + 1);
  }

  // Build shape geometries
  const shapeGeoms = new Map<string, Array<[number, number]>>();
  const grouped = new Map<string, Array<{ seq: number; lat: number; lon: number }>>();
  for (const pt of shapePoints) {
    if (!pt.shape_id) continue;
    if (!grouped.has(pt.shape_id)) grouped.set(pt.shape_id, []);
    grouped.get(pt.shape_id)!.push({
      seq: parseInt(pt.shape_pt_sequence) || 0,
      lat: parseFloat(pt.shape_pt_lat),
      lon: parseFloat(pt.shape_pt_lon),
    });
  }
  for (const [shapeId, pts] of grouped) {
    const sorted = pts.sort((a, b) => a.seq - b.seq);
    shapeGeoms.set(shapeId, sorted.map(p => [p.lon, p.lat]));
  }

  // Pick best shape per route+direction
  const routeDirs = new Map<string, { routeId: string; dirId: string }>();
  for (const trip of trips) {
    const key = `${trip.route_id}::${trip.direction_id ?? '0'}`;
    routeDirs.set(key, { routeId: trip.route_id, dirId: trip.direction_id ?? '0' });
  }

  const results: RouteShape[] = [];

  for (const [rdKey, { routeId, dirId }] of routeDirs) {
    // Find best voted shape for this route+dir
    let bestShapeId: string | null = null;
    let bestVotes = 0;
    for (const [key, count] of votes) {
      const [rId, dId] = key.split('::');
      if (rId === routeId && dId === (dirId || '0') && count > bestVotes) {
        bestShapeId = key.split('::')[2];
        bestVotes = count;
      }
    }

    if (bestShapeId && shapeGeoms.has(bestShapeId)) {
      results.push({
        gtfsRouteId: routeId,
        dirId: dirId || '0',
        sourceShapeId: bestShapeId,
        coords: shapeGeoms.get(bestShapeId)!,
        tripVoteCount: bestVotes,
        isSynthesised: false,
      });
    }
    // No shape data available for this route — skip (shape synthesis requires stop_times
    // which are no longer held in memory after streaming parse)
  }

  return results;
}

// ─── DB writers ───────────────────────────────────────────────────────────────

async function upsertAccount(client: PoolClient, slug: string, name: string): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO agency_accounts (slug, display_name, contact_email, tier)
     VALUES ($1, $2, $3, 'internal')
     ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
     RETURNING id`,
    [slug, name, `${slug}@atlas.internal`]
  );
  return res.rows[0].id;
}

async function upsertGtfsAgency(
  client: PoolClient,
  accountId: string,
  slug: string,
  name: string,
  countryCode: string | undefined,
  region: string | undefined,
  timezone: string | undefined,
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO gtfs_agencies (agency_account_id, agency_slug, display_name, country_code, region, timezone)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (agency_account_id, agency_slug) DO UPDATE
       SET display_name = EXCLUDED.display_name, updated_at = NOW()
     RETURNING id`,
    [accountId, slug, name, countryCode ?? null, region ?? null, timezone ?? null]
  );
  return res.rows[0].id;
}

async function createFeedVersion(
  client: PoolClient,
  gtfsAgencyId: string,
  accountId: string,
  opts: { filename: string; contentHash: string; fileSize: number; label?: string; feedInfoVersion?: string; effectiveFrom?: string; effectiveTo?: string }
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO feed_versions
       (gtfs_agency_id, agency_account_id, label, feed_info_version, effective_from, effective_to,
        original_filename, file_size_bytes, content_hash, status, uploaded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'processing',NOW())
     RETURNING id`,
    [
      gtfsAgencyId, accountId, opts.label ?? null, opts.feedInfoVersion ?? null,
      opts.effectiveFrom ?? null, opts.effectiveTo ?? null,
      opts.filename, opts.fileSize, opts.contentHash,
    ]
  );
  return res.rows[0].id;
}

function getModeCategory(routeType: string): string {
  const t = parseInt(routeType);
  if ([0, 1, 2, 5, 12].includes(t)) return 'rail';
  if (t === 4) return 'ferry';
  return 'surface';
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function importGtfsFeed(opts: ImportOptions): Promise<ImportResult> {
  const { zipBuffer, filename, accountSlug, accountName, label, countryCode, region } = opts;

  log.info('Import', 'starting', { filename, accountSlug });

  // Parse ZIP
  const gtfs = await parseGtfsBuffer(zipBuffer);
  log.info('Import', 'parsed', {
    routes: gtfs.routes.length,
    stops: gtfs.stops.length,
    trips: gtfs.trips.length,
  });

  const contentHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');

  // Detect effective date range
  const allDates = [
    ...gtfs.calendar.map(c => c.start_date),
    ...gtfs.calendar.map(c => c.end_date),
    ...gtfs.calendarDates.map(cd => cd.date),
  ].filter(Boolean).sort();

  const effectiveFrom = allDates[0] ?? null;
  const effectiveTo   = allDates[allDates.length - 1] ?? null;

  const feedInfoVersion = gtfs.feedInfo[0]?.feed_version ?? undefined;
  const agencyName = gtfs.agencies[0]?.agency_name ?? accountName;
  const agencyTimezone = gtfs.agencies[0]?.agency_timezone ?? undefined;

  const pool = getStaticPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Upsert account + agency
    const accountId  = await upsertAccount(client, accountSlug, accountName);
    const gtfsAgencyId = await upsertGtfsAgency(
      client, accountId, accountSlug, agencyName, countryCode, region, agencyTimezone
    );

    // 2. Create feed version
    const feedVersionId = await createFeedVersion(client, gtfsAgencyId, accountId, {
      filename,
      contentHash,
      fileSize: zipBuffer.length,
      label,
      feedInfoVersion,
      effectiveFrom: effectiveFrom ?? undefined,
      effectiveTo: effectiveTo ?? undefined,
    });

    // 3. Write routes
    for (const r of gtfs.routes) {
      await client.query(
        `INSERT INTO routes (feed_version_id, agency_account_id, gtfs_route_id, gtfs_agency_id,
           route_short_name, route_long_name, route_type, route_color, route_text_color,
           route_desc, route_url, mode_category)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (feed_version_id, gtfs_route_id) DO NOTHING`,
        [feedVersionId, accountId, r.route_id, r.agency_id ?? null,
         r.route_short_name ?? null, r.route_long_name ?? null,
         parseInt(r.route_type) || 3,
         r.route_color ?? null, r.route_text_color ?? null,
         r.route_desc ?? null, r.route_url ?? null,
         getModeCategory(r.route_type)]
      );
    }
    log.info('Import', 'routes written', { count: gtfs.routes.length });

    // 4. Write stops
    for (const s of gtfs.stops) {
      const lat = parseFloat(s.stop_lat), lon = parseFloat(s.stop_lon);
      const geom = (!isNaN(lat) && !isNaN(lon))
        ? `ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`
        : 'NULL';
      await client.query(
        `INSERT INTO stops (feed_version_id, agency_account_id, gtfs_stop_id, stop_code, stop_name,
           stop_desc, stop_lat, stop_lon, geom, zone_id, location_type, parent_station, stop_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${geom},$9,$10,$11,$12)
         ON CONFLICT (feed_version_id, gtfs_stop_id) DO NOTHING`,
        [feedVersionId, accountId, s.stop_id, s.stop_code ?? null, s.stop_name,
         s.stop_desc ?? null, lat || 0, lon || 0,
         s.zone_id ?? null, parseInt(s.location_type ?? '0') || 0,
         s.parent_station ?? null, s.stop_url ?? null]
      );
    }
    log.info('Import', 'stops written', { count: gtfs.stops.length });

    // 5. Write trips (batched to avoid huge queries)
    const BATCH = 500;
    for (let i = 0; i < gtfs.trips.length; i += BATCH) {
      const batch = gtfs.trips.slice(i, i + BATCH);
      for (const t of batch) {
        await client.query(
          `INSERT INTO trips (feed_version_id, agency_account_id, gtfs_trip_id, gtfs_route_id,
             service_id, trip_headsign, trip_short_name, direction_id, block_id, shape_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (feed_version_id, gtfs_trip_id) DO NOTHING`,
          [feedVersionId, accountId, t.trip_id, t.route_id, t.service_id,
           t.trip_headsign ?? null, t.trip_short_name ?? null,
           t.direction_id ? parseInt(t.direction_id) : null,
           t.block_id ?? null, t.shape_id ?? null]
        );
      }
    }
    log.info('Import', 'trips written', { count: gtfs.trips.length });

    // 5.5 stop_times written after COMMIT (see below)

    // 6. Write calendar
    for (const c of gtfs.calendar) {
      const bitmask = (c.monday==='1'?1:0)|(c.tuesday==='1'?2:0)|(c.wednesday==='1'?4:0)|
        (c.thursday==='1'?8:0)|(c.friday==='1'?16:0)|(c.saturday==='1'?32:0)|(c.sunday==='1'?64:0);
      await client.query(
        `INSERT INTO calendar_services (feed_version_id, agency_account_id, service_id,
           days_bitmask, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
           start_date, end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (feed_version_id, service_id) DO NOTHING`,
        [feedVersionId, accountId, c.service_id, bitmask,
         c.monday==='1', c.tuesday==='1', c.wednesday==='1', c.thursday==='1',
         c.friday==='1', c.saturday==='1', c.sunday==='1',
         // Convert YYYYMMDD → YYYY-MM-DD for Postgres DATE
         `${c.start_date.slice(0,4)}-${c.start_date.slice(4,6)}-${c.start_date.slice(6,8)}`,
         `${c.end_date.slice(0,4)}-${c.end_date.slice(4,6)}-${c.end_date.slice(6,8)}`]
      );
    }
    for (const cd of gtfs.calendarDates) {
      await client.query(
        `INSERT INTO calendar_exceptions (feed_version_id, agency_account_id, service_id, exception_date, exception_type)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (feed_version_id, service_id, exception_date) DO NOTHING`,
        [feedVersionId, accountId, cd.service_id,
         `${cd.date.slice(0,4)}-${cd.date.slice(4,6)}-${cd.date.slice(6,8)}`,
         parseInt(cd.exception_type)]
      );
    }
    log.info('Import', 'calendar written');

    // 7. Build and write route shapes
    const shapes = buildRouteShapes(gtfs);
    const circuityMap = new Map<string, number>();
    for (const shape of shapes) {
      if (shape.coords.length < 2) continue;
      const actualLen = polylineLength(shape.coords);
      const straightLen = haversine(shape.coords[0], shape.coords[shape.coords.length - 1]);
      const circuity = straightLen > 0.1 ? actualLen / straightLen : 1.0;
      circuityMap.set(`${shape.gtfsRouteId}::${shape.dirId}`, Math.round(circuity * 100) / 100);

      const geojsonCoords = shape.coords.map(([lon, lat]) => `[${lon},${lat}]`).join(',');
      await client.query(
        `INSERT INTO route_shapes (feed_version_id, agency_account_id, gtfs_route_id, direction_id,
           source_shape_id, geom, trip_vote_count, is_synthesised)
         VALUES ($1,$2,$3,$4,$5,
           ST_GeomFromGeoJSON('{"type":"LineString","coordinates":[${geojsonCoords}]}'),
           $6,$7)
         ON CONFLICT (feed_version_id, gtfs_route_id, direction_id) DO NOTHING`,
        [feedVersionId, accountId, shape.gtfsRouteId, parseInt(shape.dirId) || 0,
         shape.sourceShapeId, shape.tripVoteCount, shape.isSynthesised]
      );
    }
    log.info('Import', 'shapes written', { count: shapes.length });

    // 8. Run frequency analysis
    const refDate = detectReferenceDate(gtfs.calendar, gtfs.calendarDates, gtfs.trips);
    log.info('Import', 'reference date', { refDate });
    const rawDeps = computeRawDepartures(gtfs, refDate);
    const analysisResults = applyAnalysis(rawDeps, circuityMap);
    log.info('Import', 'analysis complete', { results: analysisResults.length });

    // Create analysis run
    const runRes = await client.query<{ id: string }>(
      `INSERT INTO analysis_runs
         (feed_version_id, agency_account_id, analysis_criteria_id, status, reference_date,
          started_at, completed_at, routes_analysed)
       VALUES ($1,$2,'00000000-0000-0000-0000-000000000001','complete',$3,NOW(),NOW(),$4)
       RETURNING id`,
      [feedVersionId, accountId,
       `${refDate.slice(0,4)}-${refDate.slice(4,6)}-${refDate.slice(6,8)}`,
       analysisResults.length]
    );
    const analysisRunId = runRes.rows[0].id;

    // Get route metadata for denormalisation
    const routeMeta = new Map(gtfs.routes.map(r => [r.route_id, r]));

    for (const r of analysisResults) {
      const route = routeMeta.get(r.gtfsRouteId);
      await client.query(
        `INSERT INTO route_frequency_results
           (analysis_run_id, feed_version_id, agency_account_id,
            gtfs_route_id, route_short_name, route_long_name, route_type, mode_category,
            direction_id, day_type, days_included, tier,
            avg_headway, median_headway, peak_headway, base_headway, headway_variance,
            service_span_start, service_span_end, trip_count,
            reliability_score, consistency_score, circuity_index, bunching_factor, bunching_penalty, outlier_penalty,
            peak_window_start, peak_window_end,
            contributing_service_ids, warnings)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
         ON CONFLICT (analysis_run_id, gtfs_route_id, direction_id, day_type) DO NOTHING`,
        [
          analysisRunId, feedVersionId, accountId,
          r.gtfsRouteId, route?.route_short_name ?? null, route?.route_long_name ?? null,
          parseInt(route?.route_type ?? '3') || 3, getModeCategory(route?.route_type ?? '3'),
          parseInt(r.dirId) || 0, r.dayType, r.daysIncluded, r.tier,
          r.avgHeadway, r.medianHeadway, r.peakHeadway, r.baseHeadway, r.headwayVariance,
          r.serviceSpanStart, r.serviceSpanEnd, r.tripCount,
          r.reliabilityScore, r.consistencyScore, r.circuityIndex, r.bunchingFactor, r.bunchingPenalty, r.outlierPenalty,
          r.peakWindowStart, r.peakWindowEnd,
          r.contributingServiceIds, r.warnings,
        ]
      );
    }
    log.info('Import', 'analysis results written', { count: analysisResults.length });

    // 9. Corridor analysis
    const corridorResults = await computeCorridors(zipBuffer, gtfs, refDate, TIME_WINDOW.start, TIME_WINDOW.end);
    log.info('Import', 'corridors computed', { count: corridorResults.length });

    for (const c of corridorResults) {
      await client.query(
        `INSERT INTO corridor_results
           (analysis_run_id, feed_version_id, agency_account_id,
            link_id, stop_a_id, stop_b_id, route_ids, route_count,
            day_type, trip_count, avg_headway, peak_headway, reliability_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (analysis_run_id, link_id, day_type) DO NOTHING`,
        [
          analysisRunId, feedVersionId, accountId,
          c.linkId, c.stopA, c.stopB, c.routeIds, c.routeCount,
          c.dayType, c.tripCount, c.avgHeadway, c.peakHeadway, c.reliabilityScore,
        ]
      );
    }
    log.info('Import', 'corridors written', { count: corridorResults.length });

    // 10. Mark feed version as current, demote previous
    await client.query(
      `UPDATE feed_versions SET is_current = FALSE
       WHERE gtfs_agency_id = $1 AND is_current = TRUE AND id != $2`,
      [gtfsAgencyId, feedVersionId]
    );
    await client.query(
      `UPDATE feed_versions SET
         status = 'ready', is_current = TRUE, processed_at = NOW(),
         route_count = $1, stop_count = $2, trip_count = $3
       WHERE id = $4`,
      [gtfs.routes.length, gtfs.stops.length, gtfs.trips.length, feedVersionId]
    );

    await client.query('COMMIT');
    log.info('Import', 'main data committed — routes, stops, trips, analysis now visible', { feedVersionId });

    // 5.5 Write stop_times AFTER main transaction commit.
    // Uses unnest arrays (9 params regardless of batch size) instead of per-row placeholders.
    // Each batch auto-commits so progress is visible incrementally.
    {
      const parseTime = (raw: string) => {
        const p = raw?.split(':');
        if (!p || p.length < 2) return null;
        return parseInt(p[0]) * 60 + parseInt(p[1]);
      };

      log.info('Import', 'writing stop_times...');
      const zipStopTimes = await JSZip.loadAsync(zipBuffer);
      let stPath = '';
      if (!zipStopTimes.file('stop_times.txt')) {
        const entry = Object.keys(zipStopTimes.files).find(f => f.endsWith('/stop_times.txt'));
        if (entry) stPath = entry;
      } else {
        stPath = 'stop_times.txt';
      }

      if (stPath) {
        let totalWritten = 0;
        const stFile = zipStopTimes.file(stPath);
        if (stFile) {
          const stream = stFile.nodeStream();
          const BATCH_SIZE = 10_000;

          let bTripIds:    string[]         = [];
          let bStopIds:    string[]         = [];
          let bSeqs:       (number|null)[]  = [];
          let bArrivals:   (number|null)[]  = [];
          let bDepartures: (number|null)[]  = [];
          let bPickup:     number[]         = [];
          let bDropOff:    number[]         = [];

          const flush = async () => {
            if (bTripIds.length === 0) return;
            await client.query(
              `INSERT INTO stop_times
                 (feed_version_id, agency_account_id, gtfs_trip_id, gtfs_stop_id,
                  stop_sequence, arrival_time, departure_time, pickup_type, drop_off_type)
               SELECT $1, $2,
                 unnest($3::text[]), unnest($4::text[]),
                 unnest($5::int[]),  unnest($6::int[]),  unnest($7::int[]),
                 unnest($8::int[]),  unnest($9::int[])
               ON CONFLICT (feed_version_id, gtfs_trip_id, stop_sequence) DO NOTHING`,
              [feedVersionId, accountId,
               bTripIds, bStopIds, bSeqs, bArrivals, bDepartures, bPickup, bDropOff]
            );
            totalWritten += bTripIds.length;
            log.info('Import', `stop_times progress: ${totalWritten.toLocaleString()} rows written`);
            bTripIds = []; bStopIds = []; bSeqs = []; bArrivals = [];
            bDepartures = []; bPickup = []; bDropOff = [];
          };

          await new Promise<void>((resolve, reject) => {
            Papa.parse(stream as any, {
              header: true,
              skipEmptyLines: true,
              transform: (v: string) => v.trim(),
              step: async (row: { data: any }, parser: any) => {
                const st = row.data;
                bTripIds.push(st.trip_id);
                bStopIds.push(st.stop_id);
                bSeqs.push(parseInt(st.stop_sequence) || null);
                bArrivals.push(parseTime(st.arrival_time));
                bDepartures.push(parseTime(st.departure_time));
                bPickup.push(parseInt(st.pickup_type) || 0);
                bDropOff.push(parseInt(st.drop_off_type) || 0);

                if (bTripIds.length >= BATCH_SIZE) {
                  parser.pause();
                  try { await flush(); } catch (e) { reject(e); return; }
                  parser.resume();
                }
              },
              complete: async () => {
                try { await flush(); resolve(); } catch (e) { reject(e); }
              },
              error: (err: any) => reject(err),
            });
          });
        }
        log.info('Import', 'stop_times written', { total: totalWritten });
      }
    }

    return {
      feedVersionId,
      agencyAccountId: accountId,
      gtfsAgencyId,
      routeCount: gtfs.routes.length,
      stopCount: gtfs.stops.length,
      tripCount: gtfs.trips.length,
      analysisResultCount: analysisResults.length,
      effectiveFrom: effectiveFrom ? `${effectiveFrom.slice(0,4)}-${effectiveFrom.slice(4,6)}-${effectiveFrom.slice(6,8)}` : null,
      effectiveTo: effectiveTo ? `${effectiveTo.slice(0,4)}-${effectiveTo.slice(4,6)}-${effectiveTo.slice(6,8)}` : null,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    log.info('Import', 'failed — rolled back', { error: String(err) });
    throw err;
  } finally {
    client.release();
  }
}
