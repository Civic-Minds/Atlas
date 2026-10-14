/**
 * Local-only: "where vehicles lose time" and headway adherence for one TTC
 * route, from archived vehicle positions (one JSONL per UTC day, see
 * Atlas-worktrees/_live-data) and the TTC "Surface Routes and Schedules for
 * BusTime" GTFS, whose trip IDs match the live feed.
 *
 *   npx tsx scripts/live-segment-delay.ts --gtfs <dir> --archive <dir> --route 504 --out <file>
 *
 * Days the GTFS calendar doesn't cover are dropped, not guessed.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildShape, projectOntoShape, type Shape } from '../shared/shapeProjection.js';
import {
  aggregateSegments, bandForHour, classifyTripStops, detectHolds, headwayBandStat, headwayWindows, median, projectRun, segmentKey,
  segmentObservations, stopPassages,
  type HoldEvent, type Pattern, type TripStopStatus, type PositionSample, type ScheduledRunTimes, type SegmentObservation, type TimeBand,
} from '../shared/segmentDelay.js';

const args: Record<string, string> = {};
process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });
const GTFS = args.gtfs;
const ARCHIVE = args.archive;
const ROUTE = args.route ?? '504';
const OUT = args.out;
const TZ = 'America/Toronto';

function readCsv(path: string, keep?: (row: Record<string, string>) => boolean): Record<string, string>[] {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const header = lines[0].replace(/^﻿/, '').split(',');
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    // TTC files quote some fields but never embed commas in them.
    const cells = lines[i].split(',').map(c => c.replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    header.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    if (!keep || keep(row)) rows.push(row);
  }
  return rows;
}
const gtfsSec = (s: string) => { const [h, m, x] = s.split(':').map(Number); return h * 3600 + m * 60 + x; };

// --- time helpers (America/Toronto) ---
const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23' });
const localCache = new Map<number, { date: string; hour: number }>();
function local(epochSec: number): { date: string; hour: number } {
  // Toronto offsets are whole hours, so local date/hour is constant within a UTC hour.
  const key = Math.floor(epochSec / 3600);
  const hit = localCache.get(key);
  if (hit) return hit;
  const v = localUncached(key * 3600);
  localCache.set(key, v);
  return v;
}
function localUncached(epochSec: number): { date: string; hour: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(epochSec * 1000)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const hourOf = (t: number) => local(t).hour;
/** Epoch of GTFS "noon minus 12h" for a local service date. */
function serviceDayStart(date: string): number {
  const noonUtc = Date.parse(`${date}T12:00:00Z`) / 1000;
  const h = local(noonUtc).hour; // local hour at 12:00Z, e.g. 8 in EDT
  return noonUtc + (12 - h) * 3600 - 12 * 3600;
}
const prevDate = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);

// --- static GTFS ---
const trips = readCsv(join(GTFS, 'trips.txt'), r => r.route_id === ROUTE);
const tripById = new Map(trips.map(t => [t.trip_id, t]));
const stopTimesPath = existsSync(join(GTFS, `${ROUTE}-stop_times.txt`)) ? join(GTFS, `${ROUTE}-stop_times.txt`) : join(GTFS, 'stop_times.txt');
const timesByTrip = new Map<string, { stopId: string; seq: number; arr: number; dep: number }[]>();
for (const st of readCsv(stopTimesPath, r => tripById.has(r.trip_id))) {
  const list = timesByTrip.get(st.trip_id) ?? [];
  list.push({ stopId: st.stop_id, seq: Number(st.stop_sequence), arr: gtfsSec(st.arrival_time), dep: gtfsSec(st.departure_time) });
  timesByTrip.set(st.trip_id, list);
}
for (const l of timesByTrip.values()) l.sort((a, b) => a.seq - b.seq);
const stopsById = new Map(readCsv(join(GTFS, 'stops.txt')).map(s => [s.stop_id, s]));

const shapeIds = new Set(trips.map(t => t.shape_id));
const shapePts = new Map<string, { seq: number; lon: number; lat: number }[]>();
for (const r of readCsv(join(GTFS, 'shapes.txt'), r => shapeIds.has(r.shape_id))) {
  const l = shapePts.get(r.shape_id) ?? [];
  l.push({ seq: Number(r.shape_pt_sequence), lon: Number(r.shape_pt_lon), lat: Number(r.shape_pt_lat) });
  shapePts.set(r.shape_id, l);
}
const tripsPerShape = new Map<string, number>();
for (const t of trips) tripsPerShape.set(t.shape_id, (tripsPerShape.get(t.shape_id) ?? 0) + 1);

const patterns = new Map<string, Pattern>();
function patternFor(shapeId: string): Pattern | null {
  if (patterns.has(shapeId)) return patterns.get(shapeId)!;
  const pts = shapePts.get(shapeId);
  const trip = trips.find(t => t.shape_id === shapeId);
  if (!pts || !trip) return null;
  pts.sort((a, b) => a.seq - b.seq);
  const shape: Shape = buildShape(pts.map(p => [p.lon, p.lat]), 10);
  const stops: Pattern['stops'] = [];
  let last = -1;
  for (const st of timesByTrip.get(trip.trip_id) ?? []) {
    const s = stopsById.get(st.stopId);
    if (!s) continue;
    const p = projectOntoShape(shape, Number(s.stop_lat), Number(s.stop_lon));
    if (!p || p.along < last) continue;
    stops.push({ stopId: st.stopId, along: p.along });
    last = p.along;
  }
  const pattern = { id: shapeId, directionId: Number(trip.direction_id), shape, stops };
  patterns.set(shapeId, pattern);
  return pattern;
}

// Direction labels from headsigns ("East - 504A King towards ...").
const directionLabels: Record<string, string> = {};
for (const t of trips) directionLabels[t.direction_id] ??= `${t.trip_headsign.split(' ')[0]}bound`;

// --- calendar ---
const calendar = readCsv(join(GTFS, 'calendar.txt'));
const calDates = readCsv(join(GTFS, 'calendar_dates.txt'));
const routeServices = new Set(trips.map(t => t.service_id));
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function activeServices(date: string): string[] | null {
  const ymd = date.replace(/-/g, '');
  if (!calendar.some(c => c.start_date <= ymd && c.end_date >= ymd)) return null;
  const dow = DOW[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const on = new Set(calendar.filter(c => c.start_date <= ymd && c.end_date >= ymd && c[dow] === '1').map(c => c.service_id));
  for (const cd of calDates) {
    if (cd.date !== ymd) continue;
    if (cd.exception_type === '1') on.add(cd.service_id);
    if (cd.exception_type === '2') on.delete(cd.service_id);
  }
  return [...on].filter(s => routeServices.has(s)).sort();
}

// --- timetable A->B running time per band, per service set ---
const scheduled: ScheduledRunTimes = new Map();
function scheduleKey(services: string[]): string {
  const key = services.join('+');
  if (scheduled.has(key)) return key;
  const raw = new Map<string, Map<TimeBand, number[]>>();
  for (const t of trips) {
    if (!services.includes(t.service_id)) continue;
    const times = timesByTrip.get(t.trip_id) ?? [];
    for (let i = 0; i < times.length - 1; i++) {
      const k = segmentKey(times[i].stopId, times[i + 1].stopId);
      const band = bandForHour(Math.floor(times[i].dep / 3600));
      const m = raw.get(k) ?? new Map<TimeBand, number[]>();
      const l = m.get(band) ?? [];
      l.push(times[i + 1].arr - times[i].dep);
      m.set(band, l);
      raw.set(k, m);
    }
  }
  scheduled.set(key, new Map([...raw].map(([k, m]) => [k, new Map([...m].map(([b, l]) => [b, median(l)!]))])));
  return key;
}

// --- archived positions ---
const files = readdirSync(ARCHIVE).filter(f => f.startsWith(`${ROUTE}-`) && f.endsWith('.jsonl')).sort();
const runs = new Map<string, PositionSample[]>();
const snapshotTimes: number[] = [];
for (const f of files) {
  for (const line of readFileSync(join(ARCHIVE, f), 'utf8').split('\n')) {
    if (!line) continue;
    const snap = JSON.parse(line) as { ts: number; v: [string, string, number, number, number | null][] };
    snapshotTimes.push(snap.ts);
    for (const [id, tripId, lat, lon, t] of snap.v) {
      const k = `${id}|${tripId}`;
      const l = runs.get(k) ?? [];
      l.push({ t: t ?? snap.ts, lat, lon });
      runs.set(k, l);
    }
  }
}
snapshotTimes.sort((a, b) => a - b);
const outages: [number, number][] = [];
for (let i = 1; i < snapshotTimes.length; i++) {
  if (snapshotTimes[i] - snapshotTimes[i - 1] > 180) outages.push([snapshotTimes[i - 1], snapshotTimes[i]]);
}

// Local dates fully inside the archive and the GTFS calendar.
const firstLocal = local(snapshotTimes[0] + 3 * 3600).date; // skip the partial first local day
const lastLocal = local(snapshotTimes[snapshotTimes.length - 1]).date;
const dateOk = new Map<string, string | null>();
function scheduleKeyForDate(date: string): string | null {
  if (!dateOk.has(date)) {
    const services = date >= firstLocal && date <= lastLocal ? activeServices(date) : null;
    dateOk.set(date, services && services.length ? scheduleKey(services) : null);
  }
  return dateOk.get(date)!;
}

/** GTFS service date: trips after midnight (before 4 a.m.) belong to the previous day. */
const serviceDateOf = (t: number) => { const l = local(t); return l.hour < 4 ? prevDate(l.date) : l.date; };

let runsTotal = 0, runsMatched = 0, runsUnmatched = 0;
const observations: SegmentObservation[] = [];
// Passages by stop+direction, for headways.
const passagesAt = new Map<string, { tripId: string; t: number }[]>();
const holds: (HoldEvent & { directionId: number })[] = [];
// Per vehicle: its runs in time order (for turn-backs); per trip: when it was seen.
const vehicleRuns = new Map<string, { tripId: string; first: PositionSample; last: PositionSample }[]>();
const tripSeenTimes = new Map<string, number[]>();
for (const [key, samples] of runs) {
  const tripId = key.split('|')[1];
  samples.sort((a, b) => a.t - b.t);
  const dedup = samples.filter((s, i) => i === 0 || s.t !== samples[i - 1].t);
  let start = 0;
  for (let i = 1; i <= dedup.length; i++) {
    if (i < dedup.length && dedup[i].t - dedup[i - 1].t <= 600) continue;
    const run = dedup.slice(start, i);
    start = i;
    runsTotal++;
    const trip = tripById.get(tripId);
    if (!trip) { runsUnmatched++; continue; }
    const pattern = patternFor(trip.shape_id);
    if (!pattern || run.length < 2) continue;
    runsMatched++;
    const vehicleId = key.split('|')[0];
    const vr = vehicleRuns.get(vehicleId) ?? [];
    vr.push({ tripId, first: run[0], last: run[run.length - 1] });
    vehicleRuns.set(vehicleId, vr);
    const seenTimes = tripSeenTimes.get(tripId) ?? [];
    for (const smp of run) seenTimes.push(smp.t);
    tripSeenTimes.set(tripId, seenTimes);
    const projected = projectRun(run, pattern);
    for (const h of detectHolds(projected, pattern)) holds.push({ ...h, directionId: pattern.directionId });
    const legs = stopPassages(projected, pattern);
    for (const o of segmentObservations(legs, pattern, '')) observations.push({ ...o, date: serviceDateOf(o.departT) });
    for (const leg of legs) for (const p of leg) {
      const k = `${p.stopId}|${pattern.directionId}`;
      const l = passagesAt.get(k) ?? [];
      l.push({ tripId, t: p.t });
      passagesAt.set(k, l);
    }
  }
}

const stats = aggregateSegments(observations, scheduled, scheduleKeyForDate, hourOf);

// --- headway adherence per stop, per (service date, band) window ---
const scheduledAt = new Map<string, { tripId: string; t: number }[]>(); // `${svcDate}|${stop}|${dir}`
const dates = [...new Set(observations.map(o => o.date))].filter(d => scheduleKeyForDate(d)).sort();
for (const svcDate of dates) {
  const services = activeServices(svcDate)!;
  const base = serviceDayStart(svcDate);
  for (const t of trips) {
    if (!services.includes(t.service_id)) continue;
    for (const st of timesByTrip.get(t.trip_id) ?? []) {
      const k = `${svcDate}|${st.stopId}|${t.direction_id}`;
      const l = scheduledAt.get(k) ?? [];
      l.push({ tripId: t.trip_id, t: base + st.dep });
      scheduledAt.set(k, l);
    }
  }
}
type Win = { date: string; actualGaps: number[]; scheduledGaps: number[] };
const headwayByStop = new Map<string, Map<TimeBand | 'all', Win[]>>();
let windowsTotal = 0, windowsKept = 0;
for (const [k, sched] of scheduledAt) {
  const [date, stopId, dir] = k.split('|');
  // Only passes by trips this stop's timetable has for that service day; other
  // vehicles (yard moves, the next day's first trips) would fill real gaps.
  const scheduledIds = new Set(sched.map(s => s.tripId));
  const obs = (passagesAt.get(`${stopId}|${dir}`) ?? []).filter(p => scheduledIds.has(p.tripId) && serviceDateOf(p.t) === date);
  const byTrip = new Map(obs.map(p => [p.tripId, p.t]));
  const byBand = new Map<TimeBand, { tripId: string; t: number }[]>();
  for (const s of sched) { const b = bandForHour(hourOf(s.t)); const l = byBand.get(b) ?? []; l.push(s); byBand.set(b, l); }
  for (const [band, bandSched] of byBand) {
    windowsTotal++;
    const wins = headwayWindows(bandSched, byTrip, obs.map(p => p.t));
    if (!wins.length) continue;
    windowsKept++;
    const m = headwayByStop.get(`${stopId}|${dir}`) ?? new Map();
    for (const b of [band, 'all'] as const) {
      const l = m.get(b) ?? [];
      for (const w of wins) l.push({ date, ...w });
      m.set(b, l);
    }
    headwayByStop.set(`${stopId}|${dir}`, m);
  }
}
const headways = [...headwayByStop].map(([k, m]) => {
  const [stopId, dir] = k.split('|');
  return {
    stopId,
    directionId: Number(dir),
    stopName: stopsById.get(stopId)?.stop_name ?? stopId,
    lonLat: [Number(stopsById.get(stopId)?.stop_lon), Number(stopsById.get(stopId)?.stop_lat)],
    bands: Object.fromEntries([...m].map(([b, wins]) => [b, headwayBandStat(wins)]).filter(([, v]) => v)),
  };
});

// --- geometry and terminal flags ---
function slice(shape: Shape, a: number, b: number): [number, number][] {
  const at = (d: number): [number, number] => {
    let i = 0;
    while (i < shape.cum.length - 2 && shape.cum[i + 1] < d) i++;
    const seg = shape.cum[i + 1] - shape.cum[i] || 1;
    const f = Math.max(0, Math.min(1, (d - shape.cum[i]) / seg));
    return [shape.pts[i][0] + f * (shape.pts[i + 1][0] - shape.pts[i][0]), shape.pts[i][1] + f * (shape.pts[i + 1][1] - shape.pts[i][1])];
  };
  const out: [number, number][] = [at(a)];
  for (let i = 0; i < shape.pts.length; i++) if (shape.cum[i] > a && shape.cum[i] < b) out.push(shape.pts[i]);
  out.push(at(b));
  return out.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);
}
const segGeom = new Map<string, [number, number][]>();
const nextStop = new Map<string, string>(); // `${stop}|${dir}` -> following stop on the busiest pattern
const terminalStops = new Set<string>();
const busiest = [...patterns.values()].sort((a, b) => (tripsPerShape.get(b.id) ?? 0) - (tripsPerShape.get(a.id) ?? 0));
for (const p of busiest) {
  if ((tripsPerShape.get(p.id) ?? 0) >= 50 && p.stops.length >= 2) {
    // Running time at a pattern's ends includes loop and layover time, not delay.
    // Include the stop next to each end: cars often wait there for their terminal slot.
    for (const st of [...p.stops.slice(0, 2), ...p.stops.slice(-2)]) terminalStops.add(st.stopId);
  }
  for (let i = 0; i < p.stops.length - 1; i++) {
    const k = segmentKey(p.stops[i].stopId, p.stops[i + 1].stopId);
    if (!segGeom.has(k)) segGeom.set(k, slice(p.shape, p.stops[i].along, p.stops[i + 1].along));
    const nk = `${p.stops[i].stopId}|${p.directionId}`;
    if (!nextStop.has(nk)) nextStop.set(nk, p.stops[i + 1].stopId);
  }
}

// --- v2: missed trips, short turns, holds (not on the card yet) ---
for (const l of vehicleRuns.values()) l.sort((a, b) => a.first.t - b.first.t);
const feedDown = (t: number) => outages.some(([x, y]) => x < t + 120 && y > t - 120);
const passByTrip = new Map<string, number[]>(); // `${tripId}|${stopId}` -> pass times
for (const [k, list] of passagesAt) {
  const stopId = k.split('|')[0];
  for (const p of list) {
    const kk = `${p.tripId}|${stopId}`;
    const l = passByTrip.get(kk) ?? [];
    l.push(p.t);
    passByTrip.set(kk, l);
  }
}
type Counts = Record<TripStopStatus, number> & { days: Set<string> };
const newCounts = (): Counts => ({ ran: 0, timing_gap: 0, not_seen: 0, ended_early: 0, joined_late: 0, feed_gap: 0, days: new Set() });
const statusByStop = new Map<string, Map<TimeBand | 'all', Counts>>();
const shortTurnsAt = new Map<string, Map<TimeBand | 'all', { n: number; days: Set<string> }>>();
let tripInstances = 0, tripsNotSeen = 0, tripsShortTurned = 0, tripsFeedGap = 0;
for (const svcDate of dates) {
  const services = activeServices(svcDate)!;
  const base = serviceDayStart(svcDate);
  for (const trip of trips) {
    if (!services.includes(trip.service_id)) continue;
    const times = timesByTrip.get(trip.trip_id) ?? [];
    if (times.length < 2) continue;
    const stopIds = times.map(x => x.stopId);
    const scheduledT = times.map(x => base + x.dep);
    const start = scheduledT[0], end = scheduledT[scheduledT.length - 1];
    if (end > snapshotTimes[snapshotTimes.length - 1]) continue; // not finished yet
    tripInstances++;
    const lo = start - 1800, hi = end + 3600;
    const seen = (tripSeenTimes.get(trip.trip_id) ?? []).some(t => t >= lo && t <= hi);
    const passed = new Set(stopIds.filter(st => (passByTrip.get(`${trip.trip_id}|${st}`) ?? []).some(t => t >= lo && t <= hi)));
    // Turn-back: the trip's last position is well short of its end, and the same
    // vehicle starts another trip within 20 min, within 500 m of where it stopped.
    let endedEarlyAfterIndex: number | null = null;
    const lastIdx = Math.max(-1, ...stopIds.map((st, i) => (passed.has(st) ? i : -1)));
    if (seen && lastIdx >= 0 && lastIdx < stopIds.length - 3) {
      for (const runs of vehicleRuns.values()) {
        const i = runs.findIndex(r => r.tripId === trip.trip_id && r.last.t >= lo && r.last.t <= hi);
        if (i < 0) continue;
        const r = runs[i], next = runs[i + 1];
        if (next && next.tripId !== trip.trip_id && next.first.t - r.last.t <= 1200 && r.last.t < end - 180
          && haversine(r.last, next.first) <= 500 && !feedDown(r.last.t)) endedEarlyAfterIndex = lastIdx;
        break;
      }
    }
    const statuses = classifyTripStops({ stopIds, scheduledT, passedStopIds: passed, seen, endedEarlyAfterIndex, feedDown });
    if (!seen && statuses.some(st => st === 'not_seen')) tripsNotSeen++;
    if (statuses.every(st => st === 'feed_gap' || st === 'ran')) { if (statuses.includes('feed_gap')) tripsFeedGap++; }
    if (endedEarlyAfterIndex != null) {
      tripsShortTurned++;
      const k = `${stopIds[endedEarlyAfterIndex]}|${trip.direction_id}`;
      const m = shortTurnsAt.get(k) ?? new Map();
      for (const b of [bandForHour(hourOf(scheduledT[endedEarlyAfterIndex])), 'all'] as const) {
        const c = m.get(b) ?? { n: 0, days: new Set<string>() };
        c.n++; c.days.add(svcDate); m.set(b, c);
      }
      shortTurnsAt.set(k, m);
    }
    statuses.forEach((st, i) => {
      const k = `${stopIds[i]}|${trip.direction_id}`;
      const m = statusByStop.get(k) ?? new Map();
      for (const b of [bandForHour(hourOf(scheduledT[i])), 'all'] as const) {
        const c = m.get(b) ?? newCounts();
        c[st]++; c.days.add(svcDate); m.set(b, c);
      }
      statusByStop.set(k, m);
    });
  }
}
function haversine(a: PositionSample, b: PositionSample): number {
  const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Ends of minor scheduled patterns (e.g. "to Roncesvalles and Queen"): waits there are
// planned layovers, not holds, so they're flagged separately from the main terminals.
const turnbackStops = new Set<string>();
for (const p of patterns.values()) {
  if ((tripsPerShape.get(p.id) ?? 0) < 5 || p.stops.length < 2) continue;
  for (const st of [p.stops[0], p.stops[p.stops.length - 1]]) if (!terminalStops.has(st.stopId)) turnbackStops.add(st.stopId);
}
const stopMeta = (stopId: string) => ({
  stopName: stopsById.get(stopId)?.stop_name ?? stopId,
  terminal: terminalStops.has(stopId),
  scheduledTurnback: turnbackStops.has(stopId),
});
const missed = [...statusByStop].map(([k, m]) => {
  const [stopId, dir] = k.split('|');
  return {
    stopId, directionId: Number(dir), ...stopMeta(stopId),
    bands: Object.fromEntries([...m].map(([b, c]) => {
      const { days, ...counts } = c;
      const scheduledPasses = Object.values(counts).reduce((a, x) => a + x, 0);
      // Share not seen, out of passes where the feed was up (feed gaps are unknown, not missed).
      const known = scheduledPasses - counts.feed_gap;
      return [b, { scheduledPasses, ...counts, days: days.size, notSeenShare: known ? Math.round((counts.not_seen / known) * 1000) / 1000 : null }];
    })),
  };
});
const shortTurns = [...shortTurnsAt].map(([k, m]) => {
  const [stopId, dir] = k.split('|');
  return { stopId, directionId: Number(dir), ...stopMeta(stopId), bands: Object.fromEntries([...m].map(([b, c]) => [b, { trips: c.n, days: c.days.size }])) };
});
const holdsAt = new Map<string, Map<TimeBand | 'all', { durations: number[]; days: Set<string> }>>();
for (const h of holds) {
  const date = serviceDateOf(h.start);
  if (!scheduleKeyForDate(date)) continue;
  const k = `${h.stopId}|${h.directionId}`;
  const m = holdsAt.get(k) ?? new Map();
  for (const b of [bandForHour(hourOf(h.start)), 'all'] as const) {
    const c = m.get(b) ?? { durations: [], days: new Set<string>() };
    c.durations.push(h.end - h.start); c.days.add(date); m.set(b, c);
  }
  holdsAt.set(k, m);
}
const holdStats = [...holdsAt].map(([k, m]) => {
  const [stopId, dir] = k.split('|');
  return {
    stopId, directionId: Number(dir), ...stopMeta(stopId),
    bands: Object.fromEntries([...m].map(([b, c]) => [b, {
      events: c.durations.length,
      days: c.days.size,
      medianSec: Math.round(median(c.durations)!),
      totalMin: Math.round(c.durations.reduce((a, x) => a + x, 0) / 60),
    }])),
  };
});
console.log(`v2: trip instances ${tripInstances}, not seen ${tripsNotSeen}, turned back ${tripsShortTurned}, touched by feed gaps ${tripsFeedGap}, hold events ${holds.length}`);

const usedDates = dates;
const result = {
  agency: 'ttc',
  route: ROUTE,
  generatedAt: new Date().toISOString(),
  gtfs: readCsv(join(GTFS, 'feed_info.txt'))[0]?.feed_version ?? null,
  dates: usedDates,
  directionLabels,
  runsTotal,
  runsMatched,
  runsUnmatched,
  observations: observations.length,
  headwayWindows: { total: windowsTotal, kept: windowsKept },
  segments: stats.map(s => ({
    ...s,
    terminal: terminalStops.has(s.fromStopId) || terminalStops.has(s.toStopId),
    fromName: stopsById.get(s.fromStopId)?.stop_name ?? s.fromStopId,
    toName: stopsById.get(s.toStopId)?.stop_name ?? s.toStopId,
    coordinates: segGeom.get(segmentKey(s.fromStopId, s.toStopId)) ?? [],
  })),
  v2: { tripInstances, tripsNotSeen, tripsShortTurned, missed, shortTurns, holds: holdStats },
  headways: headways.map(h => {
    const to = nextStop.get(`${h.stopId}|${h.directionId}`);
    return { ...h, terminal: terminalStops.has(h.stopId), coordinates: to ? segGeom.get(segmentKey(h.stopId, to)) ?? [] : [] };
  }),
};
writeFileSync(OUT, JSON.stringify(result));
console.log(`dates ${usedDates.length} (${usedDates[0]}..${usedDates[usedDates.length - 1]}), runs matched ${runsMatched}/${runsTotal} (no timetable trip: ${runsUnmatched}), passes ${observations.length}, segments ${stats.length}, headway windows ${windowsKept}/${windowsTotal}, outages ${outages.length}`);
