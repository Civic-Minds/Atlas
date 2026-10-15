/**
 * Local-only: "where vehicles lose time" and headway adherence for one TTC
 * route, from archived vehicle positions (one JSONL per UTC day, see
 * Atlas-worktrees/_live-data) and the TTC "Surface Routes and Schedules for
 * BusTime" GTFS, whose trip IDs match the live feed.
 *
 *   npx tsx scripts/live-segment-delay.ts --gtfs <dir> --archive <dir> --route 504 --out <file> [--days 7] [--obs-out <file>]
 *
 * Schema v3 (the `v3` block) adds the dashboard analysis over the last --days service dates (default 7): adherence, stops with
 * the most delay, where delays start, and where and why bunching forms. See docs/operations/LIVE_ANALYSIS.md.
 *
 * Days the GTFS calendar doesn't cover are dropped, not guessed.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildShape, haversineM, projectOntoShape, type Shape } from '../shared/shapeProjection.js';
import {
  SEGMENT_DEFAULTS, TRIP_STOP_STATUS_LABELS, aggregateSegments, bandForHour, classifyTripStops, isTurnBack, standingStillExcess, detectHolds, headwayBandStat, headwayWindows, median, projectRun, segmentKey,
  segmentObservations, stopPassages,
  type HoldEvent, type Pattern, type TripPing, type TripStopStatus, type PositionSample, type ScheduledRunTimes, type SegmentObservation, type TimeBand,
} from '../shared/segmentDelay.js';
import { adherenceReport, delayBuildup, stopDelayStats, type RunDelays, type RunStopDelay } from '../shared/stopDelay.js';
import { BUNCHED_GAP_SEC, bunchingLinks, bunchingProfile, stopBunching, type GapWindow } from '../shared/bunching.js';
import { EARLY_AT_OR_BELOW_MIN, LATE_AT_OR_ABOVE_MIN } from '../shared/liveDelayStatus.js';

const args: Record<string, string> = {};
process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });
const GTFS = args.gtfs;
const ARCHIVE = args.archive;
const ROUTE = args.route ?? '504';
const OUT = args.out;
const TZ = 'America/Toronto';
const DAYS = Number(args.days ?? 7);
const OBS_OUT = args['obs-out'];
/** A stop passage more than this far from the timetable is a wrong trip match or a bad fix, not a delay. */
const MAX_DELAY_SEC = 3600;

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
const timesByTrip = new Map<string, { stopId: string; seq: number; arr: number; dep: number; tp: boolean }[]>();
for (const st of readCsv(stopTimesPath, r => tripById.has(r.trip_id))) {
  const list = timesByTrip.get(st.trip_id) ?? [];
  list.push({ stopId: st.stop_id, seq: Number(st.stop_sequence), arr: gtfsSec(st.arrival_time), dep: gtfsSec(st.departure_time), tp: st.timepoint === '1' });
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
// The most common headsign word per direction: a few short turns are signed the other way.
const directionLabels: Record<string, string> = {};
{
  const words = new Map<string, Map<string, number>>();
  for (const t of trips) {
    const m = words.get(t.direction_id) ?? new Map<string, number>();
    const w = t.trip_headsign.split(' ')[0];
    m.set(w, (m.get(w) ?? 0) + 1);
    words.set(t.direction_id, m);
  }
  for (const [dir, m] of words) directionLabels[dir] = `${[...m].sort((a, b) => b[1] - a[1])[0][0]}bound`;
}

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
const snapshotQuality: { ts: number; vehicles: number; newest: number }[] = [];
for (const f of files) {
  for (const line of readFileSync(join(ARCHIVE, f), 'utf8').split('\n')) {
    if (!line) continue;
    const snap = JSON.parse(line) as { ts: number; v: [string, string, number, number, number | null][] };
    snapshotTimes.push(snap.ts);
    snapshotQuality.push({ ts: snap.ts, vehicles: snap.v.length, newest: snap.v.reduce((m, v) => Math.max(m, v[4] ?? 0), 0) });
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
const runDelays: RunDelays[] = [];
let delaysExcluded = 0;
const shortTurnEvents: { stopId: string; directionId: number; date: string }[] = [];
// Per vehicle: its runs in time order (for turn-backs); per trip: when it was seen.
const vehicleRuns = new Map<string, { tripId: string; first: PositionSample; last: PositionSample; samples: PositionSample[] }[]>();
const tripPings = new Map<string, TripPing[]>(); // per trip number: reports, with position along its route
const unlistedRuns: [number, number][] = []; // when cars on trip numbers missing from the timetable were running
const tripOffRoute = new Map<string, [number, number, number][]>(); // [start, end, pings]
// TTC streetcar carhouses: cars entering or leaving service stand still nearby.
const CARHOUSES: [number, number][] = [
  [43.6400, -79.4477], // Roncesvalles
  [43.6655, -79.3205], // Russell
  [43.6620, -79.3300], // Leslie Barns
];
const nearCarhouse = (lat: number, lon: number) => CARHOUSES.some(([a, b]) => haversineM(lat, lon, a, b) <= 400);
// Places where off-shape positions are terminal-loop or yard geometry, not diversions.
const NOT_DIVERSIONS: [number, number][] = [...CARHOUSES, [43.6337, -79.4246] /* Dufferin Gate loop */];
const notDiversion = (lat: number, lon: number) => NOT_DIVERSIONS.some(([a, b]) => haversineM(lat, lon, a, b) <= 400);
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
    // Any ping (even a single one) counts as the trip being seen.
    const vehicleId = key.split('|')[0];
    const vr = vehicleRuns.get(vehicleId) ?? [];
    vr.push({ tripId, first: run[0], last: run[run.length - 1], samples: run });
    vehicleRuns.set(vehicleId, vr);
    const trip = tripById.get(tripId);
    if (!trip) { runsUnmatched++; unlistedRuns.push([run[0].t, run[run.length - 1].t]); continue; }
    const pattern = patternFor(trip.shape_id);
    const projected = pattern ? projectRun(run, pattern) : [];
    const tp = tripPings.get(tripId) ?? [];
    run.forEach((smp, idx) => {
      const pr = projected[idx];
      tp.push({ t: smp.t, along: pr && pr.perpM <= SEGMENT_DEFAULTS.maxPerpM ? pr.along : null });
    });
    tripPings.set(tripId, tp);
    if (!pattern || run.length < 2) continue;
    runsMatched++;
    // Off-route stretches (detours), for labelling untimed stops.
    const off = tripOffRoute.get(tripId) ?? [];
    // Consecutive off-shape pings only (no merging strays minutes apart), and not
    // within 300 m of either end, where terminal loops don't follow the drawn shape.
    let prevOff = false;
    for (const [idx, p] of projected.entries()) {
      const isOff = p.perpM > SEGMENT_DEFAULTS.maxPerpM && p.along > 300 && p.along < pattern.shape.total - 300
        && !notDiversion(run[idx].lat, run[idx].lon);
      if (isOff) {
        const lastOff = off[off.length - 1];
        if (prevOff && lastOff) { lastOff[1] = p.t; lastOff[2]++; } else off.push([p.t, p.t, 1]);
      }
      prevOff = isOff;
    }
    tripOffRoute.set(tripId, off);
    const times = timesByTrip.get(tripId) ?? [];
    for (const h of detectHolds(projected, pattern)) {
      if (!times.length) continue;
      const stop = stopsById.get(h.stopId);
      const base = serviceDayStart(serviceDateOf(h.start));
      const st = times.find(x => x.stopId === h.stopId);
      const excess = standingStillExcess({
        start: h.start, end: h.end, runFirst: run[0].t, runLast: run[run.length - 1].t,
        stopIndex: pattern.stops.findIndex(x => x.stopId === h.stopId), patternStops: pattern.stops.length,
        nearCarhouse: !!stop && nearCarhouse(Number(stop.stop_lat), Number(stop.stop_lon)),
        scheduledStart: base + times[0].dep, scheduledEnd: base + times[times.length - 1].arr,
        scheduledDwellSec: st ? st.dep - st.arr : 0,
      });
      if (excess != null) holds.push({ ...h, end: h.start + excess, directionId: pattern.directionId });
    }
    const legs = stopPassages(projected, pattern);
    // v3: delay at each stop = when the car passed it minus the timetable's departure for this trip there.
    const firstPassage = legs.flat()[0];
    if (firstPassage && times.length) {
      const svcDate = serviceDateOf(firstPassage.t);
      const base = serviceDayStart(svcDate);
      const depByStop = new Map<string, number>();
      const tpByStop = new Map<string, boolean>();
      for (const st of times) if (!depByStop.has(st.stopId)) { depByStop.set(st.stopId, st.dep); tpByStop.set(st.stopId, st.tp); }
      const seen = new Set<string>();
      const stopsOut: RunStopDelay[] = [];
      for (const leg of legs) for (const p of leg) {
        const dep = depByStop.get(p.stopId);
        if (dep == null || seen.has(p.stopId)) continue;
        const delaySec = p.t - (base + dep);
        if (Math.abs(delaySec) > MAX_DELAY_SEC) { delaysExcluded++; continue; }
        seen.add(p.stopId);
        stopsOut.push({ stopId: p.stopId, t: p.t, hour: hourOf(p.t), delaySec, timepoint: tpByStop.get(p.stopId) === true });
      }
      if (stopsOut.length) runDelays.push({ date: svcDate, directionId: pattern.directionId, tripId, stops: stopsOut });
    }
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

// --- the section every branch shares, per direction: gaps pooled across its stops ---
// A stop is on it when its passes are at least 3/4 of the busiest stop's in that direction
// (the same rule the card uses on stop pairs); line ends are left out below.
function sharedSectionStats(terminal: Set<string>) {
  const out: Record<string, { stops: string[]; bands: Record<string, ReturnType<typeof headwayBandStat>> }> = {};
  for (const dir of new Set(headways.map(h => h.directionId))) {
    const counts = headways.filter(h => h.directionId === dir).map(h => ({ id: h.stopId, n: (passagesAt.get(`${h.stopId}|${dir}`) ?? []).length }));
    const max = Math.max(...counts.map(c => c.n));
    const stops = counts.filter(c => c.n >= 0.75 * max && !terminal.has(c.id)).map(c => c.id);
    const pooled = new Map<string, Win[]>();
    for (const id of stops) {
      for (const [b, wins] of headwayByStop.get(`${id}|${dir}`) ?? []) pooled.set(b, [...(pooled.get(b) ?? []), ...wins]);
    }
    out[dir] = { stops, bands: Object.fromEntries([...pooled].map(([b, wins]) => [b, headwayBandStat(wins)]).filter(([, v]) => v)) };
  }
  return out;
}

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

// Feed health per minute: an outage (no snapshot), an empty or stale snapshot, or
// far fewer vehicles than the timetable has in service all count as degraded.
const scheduledInService = new Map<number, number>();
const tripInstanceList: { svcDate: string; trip: typeof trips[number]; base: number }[] = [];
for (const svcDate of dates) {
  const services = activeServices(svcDate)!;
  const base = serviceDayStart(svcDate);
  for (const trip of trips) {
    if (!services.includes(trip.service_id)) continue;
    const times = timesByTrip.get(trip.trip_id) ?? [];
    if (times.length < 2) continue;
    tripInstanceList.push({ svcDate, trip, base });
    for (let m = Math.floor((base + times[0].dep) / 60); m <= Math.floor((base + times[times.length - 1].arr) / 60); m++) {
      scheduledInService.set(m, (scheduledInService.get(m) ?? 0) + 1);
    }
  }
}
const degradedMinutes = new Set<number>();
let degradedEmpty = 0, degradedStale = 0, degradedThin = 0;
snapshotQuality.sort((a, b) => a.ts - b.ts);
snapshotQuality.forEach((q, i) => {
  const m = Math.floor(q.ts / 60);
  const expected = scheduledInService.get(m) ?? 0;
  const prev = snapshotQuality[i - 1];
  if (expected >= 4 && q.vehicles === 0) { degradedEmpty++; degradedMinutes.add(m); }
  else if (q.vehicles > 0 && (q.newest < q.ts - 300 || (prev && prev.newest === q.newest && q.ts - prev.ts >= 50))) { degradedStale++; degradedMinutes.add(m); }
  else if (expected >= 4 && q.vehicles < 0.5 * expected) { degradedThin++; degradedMinutes.add(m); }
});
const firstSnap = snapshotTimes[0], lastSnap = snapshotTimes[snapshotTimes.length - 1];
const feedDown = (t: number) => {
  if (t - 120 < firstSnap || t + 120 > lastSnap) return true;
  if (outages.some(([x, y]) => x < t + 120 && y > t - 120)) return true;
  for (let m = Math.floor((t - 120) / 60); m <= Math.floor((t + 120) / 60); m++) if (degradedMinutes.has(m)) return true;
  return false;
};

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
const newCounts = (): Counts => ({ ran: 0, timing_gap: 0, quiet_spell: 0, off_route: 0, not_seen: 0, unlisted_cover: 0, started_other_trip: 0, joined_late: 0, stopped_reporting: 0, feed_gap: 0, days: new Set() });
const statusByStop = new Map<string, Map<TimeBand | 'all', Counts>>();
const shortTurnsAt = new Map<string, Map<TimeBand | 'all', { n: number; days: Set<string> }>>();
let firstStopJoinedLate = 0;
let tripsShortExcluded = 0, tripsUnlistedCover = 0;
let tripInstances = 0, tripsNotSeen = 0, tripsShortTurned = 0, tripsFeedGap = 0;
for (const { svcDate, trip, base } of tripInstanceList) {
  const times = timesByTrip.get(trip.trip_id)!;
  const stopIds = times.map(x => x.stopId);
  const scheduledT = times.map(x => base + x.dep);
  const start = scheduledT[0], end = scheduledT[scheduledT.length - 1];
  if (end + 3600 > lastSnap) continue; // not finished yet
  // Short pieces (10 stops or fewer, or under 12 min) are left out: too short to judge.
  if (stopIds.length <= 10 || end - start < 720) { tripsShortExcluded++; continue; }
  tripInstances++;
  const lo = start - 1800, hi = end + 3600;
  const pings = (tripPings.get(trip.trip_id) ?? []).filter(p => p.t >= lo && p.t <= hi);
  const firstPing = pings.length ? Math.min(...pings.map(p => p.t)) : null;
  const passT = new Map<string, number>();
  for (const st of stopIds) {
    const t = (passByTrip.get(`${trip.trip_id}|${st}`) ?? []).find(x => x >= lo && x <= hi);
    if (t != null) passT.set(st, t);
  }
  const pattern = patternFor(trip.shape_id);
  const stopAlong = stopIds.map(st => {
    const stop = stopsById.get(st);
    return pattern && stop ? projectOntoShape(pattern.shape, Number(stop.stop_lat), Number(stop.stop_lon))?.along ?? 0 : 0;
  });
  // Every piece of this trip, on every car that reported it.
  const pieces = [...vehicleRuns.entries()].flatMap(([vehicle, vr]) => vr
    .map((r, i) => ({ vehicle, r, next: vr[i + 1], prev: vr[i - 1] }))
    .filter(x => x.r.tripId === trip.trip_id && x.r.last.t >= lo && x.r.first.t <= hi));
  const overlappingCars = pieces.some(x => pieces.some(y => y.vehicle !== x.vehicle && y.r.first.t < x.r.last.t && x.r.first.t < y.r.last.t));
  const offRoute = (tripOffRoute.get(trip.trip_id) ?? []).filter(([a, b, n]) => b >= lo && a <= hi && n >= 2).map(([a, b]) => [a, b] as [number, number]);
  // Turn-back: well short of the route end, the same car starts a trip in the
  // opposite direction within 20 min and 500 m, and actually heads back.
  let startedOtherTripAfterIndex: number | null = null;
  const lastIdx = Math.max(-1, ...stopIds.map((st, i) => (passT.has(st) ? i : -1)));
  if (lastIdx >= 0 && pattern && pieces.length) {
    const final = pieces.reduce((m, x) => (x.r.last.t > m.r.last.t ? x : m));
    const { r, next } = final;
    const nextDir = next ? tripById.get(next.tripId)?.direction_id : undefined;
    const lastProj = projectOntoShape(pattern.shape, r.last.lat, r.last.lon);
    if (process.env.DEBUG_TRIPS?.split(',').includes(`${trip.trip_id}@${svcDate}`)) {
      console.log('  tb-in', 'next', next?.tripId, 'nextDir', nextDir, 'dir', trip.direction_id, 'perp', lastProj?.perpDistM?.toFixed(0), 'carhouse', nearCarhouse(r.last.lat, r.last.lon),
        'gap', next ? next.first.t - r.last.t : null, 'dist', next ? haversineM(r.last.lat, r.last.lon, next.first.lat, next.first.lon).toFixed(0) : null,
        'fromEnd', lastProj ? (pattern.shape.total - lastProj.along).toFixed(0) : null, 'nextSamples', next?.samples.slice(0, 5).map(x => projectOntoShape(pattern.shape, x.lat, x.lon)).map(x => `${x?.along.toFixed(0)}/${x?.perpDistM.toFixed(0)}`).join(' '), 'lastAlong', lastProj?.along.toFixed(0));
    }
    // By a carhouse, a car pulling in and a car turning back look alike unless it
    // heads out again within 5 minutes.
    const nextGap = next ? next.first.t - r.last.t : Infinity;
    if (next && nextDir != null && lastProj && lastProj.perpDistM <= SEGMENT_DEFAULTS.maxPerpM && !feedDown(r.last.t)
      && (!nearCarhouse(r.last.lat, r.last.lon) || nextGap <= 300)) {
      // Actual reversal: the next trip moves forward along *its own* (opposite) route.
      const nextTrip = tripById.get(next.tripId);
      const nextPattern = nextTrip ? patternFor(nextTrip.shape_id) : null;
      // (within its first 15 minutes: it may lay over first)
      const nextAlongs = nextPattern ? next.samples.filter(x => x.t <= next.first.t + 900)
        .map(x => projectOntoShape(nextPattern.shape, x.lat, x.lon))
        .filter(x => x && x.perpDistM <= SEGMENT_DEFAULTS.maxPerpM)
        .map(x => x!.along) : [];
      if (isTurnBack({
        metresFromRouteEnd: Math.min(pattern.shape.total - lastProj.along, stopAlong[stopAlong.length - 1] - stopAlong[lastIdx]),
        nextTripSameDirection: nextDir === trip.direction_id,
        gapSec: next.first.t - r.last.t,
        distanceM: haversineM(r.last.lat, r.last.lon, next.first.lat, next.first.lon),
        reversedM: nextAlongs.length ? Math.max(...nextAlongs) - nextAlongs[0] : 0,
        overlappingCars,
        offRouteBeforeEnd: offRoute.some(([, b]) => b >= r.last.t - 600),
      })) startedOtherTripAfterIndex = lastIdx;
    }
  }
  // The car that first reported this trip had just finished another trip right by
  // this trip's first stop (within 400 m and 10 min): it started at the start.
  let startedAtFirstStop = false;
  if (pieces.length) {
    const firstPiece = pieces.reduce((m, x) => (x.r.first.t < m.r.first.t ? x : m));
    const prev = firstPiece.prev;
    const firstStop = stopsById.get(stopIds[0]);
    if (prev && prev.tripId !== trip.trip_id && firstPiece.r.first.t - prev.last.t <= 600 && firstStop
      && haversineM(prev.last.lat, prev.last.lon, Number(firstStop.stop_lat), Number(firstStop.stop_lon)) <= 400) startedAtFirstStop = true;
  }
  const unlistedCover = unlistedRuns.some(([a, b]) => a <= end && b >= start);
  const statuses = classifyTripStops({
    stopIds, stopAlong, scheduledT, passT, pings, offRoute, startedAtFirstStop, unlistedCover, startedOtherTripAfterIndex, feedDown,
  });
  if (process.env.DEBUG_TRIPS?.split(',').includes(`${trip.trip_id}@${svcDate}`)) {
    const tally: Record<string, number> = {};
    statuses.forEach(st => { tally[st] = (tally[st] ?? 0) + 1; });
    console.log('debug', trip.trip_id, svcDate, JSON.stringify(tally), 'first status', statuses[0], 'turn-back', startedOtherTripAfterIndex);
    console.log('  pings', firstPing, pings.length, 'sched', start, end, 'passT', JSON.stringify([...passT]));
  }
  if (process.env.DEBUG_FIRST && statuses[0] === 'joined_late') {
    firstStopJoinedLate++;
    if (firstStopJoinedLate <= 6) {
      const fp = pieces.length ? pieces.reduce((m, x) => (x.r.first.t < m.r.first.t ? x : m)) : null;
      console.log('  JL', trip.trip_id, svcDate, 'firstPing-start', (firstPing ?? 0) - start, 'prev', fp?.prev ? `${fp.prev.tripId} ended ${fp.r.first.t - fp.prev.last.t}s before` : 'none', 'pieces', pieces.length, 'startedAtFirstStop', startedAtFirstStop);
    }
  }
  if (statuses.every(st => st === 'not_seen')) tripsNotSeen++;
  if (statuses.every(st => st === 'unlisted_cover')) tripsUnlistedCover++;
  if (firstPing == null && statuses.every(st => st === 'feed_gap')) tripsFeedGap++;
  if (startedOtherTripAfterIndex != null) {
    tripsShortTurned++;
    shortTurnEvents.push({ stopId: stopIds[startedOtherTripAfterIndex], directionId: Number(trip.direction_id), date: svcDate });
    if (process.env.DEBUG_FIRST) console.log('  TB', trip.trip_id, svcDate, stopsById.get(stopIds[startedOtherTripAfterIndex])?.stop_name, 'cars', new Set(pieces.map(x => x.vehicle)).size);
    const k = `${stopIds[startedOtherTripAfterIndex]}|${trip.direction_id}`;
    const m = shortTurnsAt.get(k) ?? new Map();
    for (const b of [bandForHour(hourOf(scheduledT[startedOtherTripAfterIndex])), 'all'] as const) {
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
// Ends of minor scheduled patterns (e.g. "to Roncesvalles and Queen"): waits there are
// planned layovers, not holds, so they're flagged separately from the main terminals.
const turnbackStops = new Set<string>();
for (const p of patterns.values()) {
  if ((tripsPerShape.get(p.id) ?? 0) < 5 || p.stops.length < 2) continue;
  for (const st of [p.stops[0], p.stops[p.stops.length - 1]]) if (!terminalStops.has(st.stopId)) turnbackStops.add(st.stopId);
}
const stopMeta = (stopId: string) => {
  const stop = stopsById.get(stopId);
  return {
    stopName: stop?.stop_name ?? stopId,
    terminal: terminalStops.has(stopId),
    scheduledTurnback: turnbackStops.has(stopId),
    nearCarhouse: !!stop && nearCarhouse(Number(stop.stop_lat), Number(stop.stop_lon)),
  };
};
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
// Stood-still events (labelled that way, not "holds"): excess over the timetable's dwell.
let standingStillDegraded = 0;
for (const h of holds) {
  const date = serviceDateOf(h.start);
  if (feedDown(h.start) || feedDown(h.end) || feedDown((h.start + h.end) / 2)) { standingStillDegraded++; continue; }
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
  const to = nextStop.get(`${stopId}|${dir}`);
  return {
    stopId, directionId: Number(dir), ...stopMeta(stopId),
    coordinates: to ? segGeom.get(segmentKey(stopId, to)) ?? [] : [],
    bands: Object.fromEntries([...m].map(([b, c]) => [b, {
      events: c.durations.length,
      days: c.days.size,
      medianSec: Math.round(median(c.durations)!),
      totalMin: Math.round(c.durations.reduce((a, x) => a + x, 0) / 60),
    }])),
  };
});
if (process.env.DEBUG_FIRST) console.log('joined_late at first stop:', firstStopJoinedLate);
console.log(`v2: trip instances ${tripInstances} (short pieces left out ${tripsShortExcluded}), not seen ${tripsNotSeen}, unlisted cover ${tripsUnlistedCover}, feed-gap trips ${tripsFeedGap}, turned back ${tripsShortTurned}, stood-still events ${holds.length}, degraded snapshots empty/stale/thin ${degradedEmpty}/${degradedStale}/${degradedThin}, stood-still dropped for degraded feed ${standingStillDegraded}`);

// --- v3: the dashboard analysis over the last DAYS service dates ---
const windowDates = [...new Set(runDelays.map(r => r.date))].filter(d => scheduleKeyForDate(d)).sort().slice(-DAYS);
const inWindow = new Set(windowDates);
const windowRuns = runDelays.filter(r => inWindow.has(r.date));
const isWeekend = (d: string) => { const g = new Date(`${d}T12:00:00Z`).getUTCDay(); return g === 0 || g === 6; };
const stopOrder = new Map<number, string[]>();
for (const p of busiest) if (!stopOrder.has(p.directionId)) stopOrder.set(p.directionId, p.stops.map(s => s.stopId));
const stopInfo = (stopId: string) => ({ stopId, name: stopsById.get(stopId)?.stop_name ?? stopId, lonLat: [Number(stopsById.get(stopId)?.stop_lon), Number(stopsById.get(stopId)?.stop_lat)] as [number, number] });
const orderIndex = (dir: number, stopId: string) => stopOrder.get(dir)?.indexOf(stopId) ?? -1;
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
const r3 = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 1000);

const stopStatsV3 = stopDelayStats(windowRuns).map(s => ({
  ...stopInfo(s.stopId), directionId: s.directionId, order: orderIndex(s.directionId, s.stopId), n: s.n,
  medianMin: r1(s.medianMin), p90Min: r1(s.p90Min), lateShare: r3(s.lateShare), earlyShare: r3(s.earlyShare), ranked: s.ranked,
})).sort((a, b) => a.directionId - b.directionId || a.order - b.order);
const buildupV3 = delayBuildup(windowRuns, stopOrder).map(d => {
  const named = (s: typeof d.start) => s && { ...s, fromName: stopInfo(s.fromStopId).name, toName: stopInfo(s.toStopId).name, medianAddedMin: r1(s.medianAddedMin), addedShare: r3(s.addedShare), medianDelayMin: r1(s.medianDelayMin), p10DelayMin: r1(s.p10DelayMin), p90DelayMin: r1(s.p90DelayMin) };
  return { directionId: d.directionId, startingDelayMin: r1(d.startingDelayMin), start: named(d.start), biggest: named(d.biggest), stretches: d.stretches.map(s => named(s)) };
});

// Bunching (B4): gaps between consecutive vehicles at each stop, per direction and band, then what lines up with it.
const windowHolds = holds.filter(h => inWindow.has(serviceDateOf(h.start)) && !feedDown(h.start) && !feedDown(h.end) && !feedDown((h.start + h.end) / 2));
const windowShortTurns = shortTurnEvents.filter(e => inWindow.has(e.date));
const windowSegments = aggregateSegments(observations.filter(o => inWindow.has(o.date)), scheduled, scheduleKeyForDate, hourOf);
const perDay = (n: number) => (windowDates.length ? n / windowDates.length : 0);
const BANDS: (TimeBand | 'all')[] = ['all', 'amPeak', 'midday', 'pmPeak', 'evening'];
const bunchingV3 = [...stopOrder].map(([dir, order]) => ({
  directionId: dir,
  bands: Object.fromEntries(BANDS.map(band => {
    const stops = order.map(stopId => {
      const wins: GapWindow[] = (headwayByStop.get(`${stopId}|${dir}`)?.get(band) ?? []).filter(w => inWindow.has(w.date));
      return stopBunching(stopId, wins);
    });
    const profile = bunchingProfile(stops);
    const evidenceFor = (fromId: string, toId: string) => {
      const a = Math.max(0, order.indexOf(fromId) - 2), b = order.indexOf(toId);
      const near = new Set(order.slice(a, b + 1));
      const evs = windowHolds.filter(h => h.directionId === dir && near.has(h.stopId));
      const segs = windowSegments.filter(s => s.directionId === dir && near.has(s.fromStopId) && near.has(s.toStopId));
      const slow = segs.map(s => ({ fromStopId: s.fromStopId, toStopId: s.toStopId, gainedSec: s.bands[band === 'all' ? 'all' : band]?.gainedMedianSec ?? null }))
        .filter((s): s is { fromStopId: string; toStopId: string; gainedSec: number } => s.gainedSec != null)
        .sort((x, y) => y.gainedSec - x.gainedSec)[0] ?? null;
      // The first stop with enough gaps stands for the terminal end (no gaps are measured at the very first stop).
      const term = stops.find(x => x.n >= 30);
      return {
        terminalBadShare: term ? term.badShare : null,
        standStill: { eventsPerDay: perDay(evs.length), minutesPerDay: perDay(evs.reduce((m, h) => m + (h.end - h.start) / 60, 0)) },
        slowestSegment: slow,
        shortTurnsPerDay: perDay(windowShortTurns.filter(e => e.directionId === dir && near.has(e.stopId)).length),
      };
    };
    const describe = (s: typeof profile.forms) => s && { ...s, fromName: stopInfo(s.fromStopId).name, toName: stopInfo(s.toStopId).name, rise: r3(s.rise), fromBadShare: r3(s.fromBadShare), toBadShare: r3(s.toBadShare), links: bunchingLinks(evidenceFor(s.fromStopId, s.toStopId)), evidence: evidenceFor(s.fromStopId, s.toStopId) };
    return [band, {
      baselineBadShare: r3(profile.baselineBadShare),
      forms: describe(profile.forms),
      biggestRise: describe(profile.biggestRise),
      stops: stops.map((s, i) => ({ ...stopInfo(s.stopId), order: i, n: s.n, bunchedShare: r3(s.bunchedShare), gappedShare: r3(s.gappedShare), badShare: r3(s.badShare), medianGapSec: s.medianGapSec == null ? null : Math.round(s.medianGapSec), spread: r1(s.spread) })),
    }];
  })),
}));

const v3 = {
  schema: 3,
  window: { days: windowDates.length, dates: windowDates, requestedDays: DAYS },
  thresholds: { earlyAtOrBelowMin: EARLY_AT_OR_BELOW_MIN, lateAtOrAboveMin: LATE_AT_OR_ABOVE_MIN, bunchedGapSec: BUNCHED_GAP_SEC },
  method: 'Delay at a stop = the time the car passed it (interpolated between archived positions, projected on the trip\'s shape) minus the timetable\'s departure for that trip at that stop. Trips are matched by trip number; passages more than an hour off the timetable are dropped. Estimated from positions: the TTC feed has no delay values. "Early" means the car passed the stop before the timetable\'s time; cars often wait to leave on time, so lateness is the reliable figure and the headline is the share that is not late.',
  totals: { runs: windowRuns.length, stopPassages: windowRuns.reduce((n, r) => n + r.stops.length, 0), droppedOffTimetable: delaysExcluded },
  directionLabels,
  // The headline adherence counts timepoints only (where the timetable really schedules a time); allStops counts every stop.
  adherence: {
    timepoints: {
      all: adherenceReport(windowRuns, { timepointsOnly: true }),
      weekday: adherenceReport(windowRuns.filter(r => !isWeekend(r.date)), { timepointsOnly: true }),
      weekend: adherenceReport(windowRuns.filter(r => isWeekend(r.date)), { timepointsOnly: true }),
    },
    allStops: {
      all: adherenceReport(windowRuns),
      weekday: adherenceReport(windowRuns.filter(r => !isWeekend(r.date))),
      weekend: adherenceReport(windowRuns.filter(r => isWeekend(r.date))),
    },
  },
  stops: stopStatsV3,
  buildup: buildupV3,
  bunching: bunchingV3,
};
if (OBS_OUT) writeFileSync(OBS_OUT, JSON.stringify(windowRuns));
console.log(`v3: window ${windowDates.length} days (${windowDates[0]}..${windowDates[windowDates.length - 1]}), runs ${windowRuns.length}, stop passages ${v3.totals.stopPassages}, dropped off-timetable ${delaysExcluded}`);

const usedDates = dates;
const result = {
  agency: 'ttc',
  route: ROUTE,
  generatedAt: new Date().toISOString(),
  gtfs: existsSync(join(GTFS, 'feed_info.txt')) ? readCsv(join(GTFS, 'feed_info.txt'))[0]?.feed_version ?? null : null,
  dates: usedDates,
  directionLabels,
  // The timetable runs this route entirely as replacement buses (e.g. 503, 507 in fall 2026).
  replacementBuses: trips.length > 0 && trips.every(t => /replacement bus/i.test(t.trip_headsign)),
  // Trip number -> direction, so the live card can place current vehicles (the live feed's trip IDs match this timetable).
  tripDirections: Object.fromEntries([...new Set(trips.map(t => t.direction_id))].map(d => [d, trips.filter(t => t.direction_id === d).map(t => t.trip_id)])),
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
  v2: {
    tripInstances, tripsNotSeen, tripsUnlistedCover, tripsFeedGap, tripsShortExcluded, tripsShortTurned,
    notSeenLabel: 'No vehicle reported under this trip\'s number: N of M scheduled trips. Not a count of cancellations; trips cut short aren\'t included.',
    degradedSnapshots: { empty: degradedEmpty, stale: degradedStale, thin: degradedThin },
    standingStillDroppedForFeed: standingStillDegraded,
    statusLabels: TRIP_STOP_STATUS_LABELS,
    standingStillLabel: 'Stood still 2+ min near this stop (terminals, turn-back points, carhouses, layovers and operator changes left out)',
    missed, shortTurns, standingStill: holdStats,
  },
  sharedSection: sharedSectionStats(terminalStops),
  v3,
  headways: headways.map(h => {
    const to = nextStop.get(`${h.stopId}|${h.directionId}`);
    return { ...h, terminal: terminalStops.has(h.stopId), coordinates: to ? segGeom.get(segmentKey(h.stopId, to)) ?? [] : [] };
  }),
};
writeFileSync(OUT, JSON.stringify(result));
console.log(`dates ${usedDates.length} (${usedDates[0]}..${usedDates[usedDates.length - 1]}), runs matched ${runsMatched}/${runsTotal} (no timetable trip: ${runsUnmatched}), passes ${observations.length}, segments ${stats.length}, headway windows ${windowsKept}/${windowsTotal}, outages ${outages.length}`);
