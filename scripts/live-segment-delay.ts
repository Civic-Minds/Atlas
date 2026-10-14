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
  aggregateSegments, bandForHour, headwayBandStat, headwayWindows, median, projectRun, segmentKey,
  segmentObservations, stopPassages,
  type Pattern, type PositionSample, type ScheduledRunTimes, type SegmentObservation, type TimeBand,
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

let runsTotal = 0, runsMatched = 0, runsUnmatched = 0;
const observations: SegmentObservation[] = [];
// Passages by stop+direction, for headways.
const passagesAt = new Map<string, number[]>();
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
    const legs = stopPassages(projectRun(run, pattern), pattern);
    const date = local(run[0].t).date;
    observations.push(...segmentObservations(legs, pattern, date));
    for (const leg of legs) for (const p of leg) {
      const k = `${p.stopId}|${pattern.directionId}`;
      const l = passagesAt.get(k) ?? [];
      l.push(p.t);
      passagesAt.set(k, l);
    }
  }
}

// Each observation is dated by local service date of its departure.
for (const o of observations) o.date = local(o.departT).date;
const stats = aggregateSegments(observations, scheduled, scheduleKeyForDate, hourOf);

// --- headway adherence per stop, per (local date, band) window ---
const scheduledAt = new Map<string, number[]>(); // `${date}|${stop}|${dir}` -> epoch times
const dates = [...dateOk.keys()].filter(d => dateOk.get(d));
for (const date of dates) {
  for (const svcDate of [date, prevDate(date)]) {
    const services = activeServices(svcDate);
    if (!services) continue;
    const base = serviceDayStart(svcDate);
    for (const t of trips) {
      if (!services.includes(t.service_id)) continue;
      for (const st of timesByTrip.get(t.trip_id) ?? []) {
        const epoch = base + st.dep;
        if (local(epoch).date !== date) continue;
        const k = `${date}|${st.stopId}|${t.direction_id}`;
        const l = scheduledAt.get(k) ?? [];
        l.push(epoch);
        scheduledAt.set(k, l);
      }
    }
  }
}
const windowHasOutage = (a: number, b: number) => outages.some(([x, y]) => x < b && y > a);
type Win = { date: string; actualGaps: number[]; scheduledGaps: number[] };
const headwayByStop = new Map<string, Map<TimeBand | 'all', Win[]>>();
let windowsTotal = 0, windowsKept = 0;
for (const [k, sched] of scheduledAt) {
  const [date, stopId, dir] = k.split('|');
  const obs = (passagesAt.get(`${stopId}|${dir}`) ?? []).filter(t => local(t).date === date);
  const byBand = new Map<TimeBand, { s: number[]; o: number[] }>();
  for (const t of sched) { const b = bandForHour(hourOf(t)); const w = byBand.get(b) ?? { s: [], o: [] }; w.s.push(t); byBand.set(b, w); }
  for (const t of obs) { const w = byBand.get(bandForHour(hourOf(t))); if (w) w.o.push(t); }
  for (const [band, w] of byBand) {
    windowsTotal++;
    const lo = Math.min(...w.s), hi = Math.max(...w.s);
    if (windowHasOutage(lo - 300, hi + 300)) continue;
    const res = headwayWindows(w.o, w.s);
    if (!res) continue;
    windowsKept++;
    const m = headwayByStop.get(`${stopId}|${dir}`) ?? new Map();
    for (const b of [band, 'all'] as const) {
      const l = m.get(b) ?? [];
      l.push({ date, ...res });
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

const usedDates = dates.sort();
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
  headways: headways.map(h => {
    const to = nextStop.get(`${h.stopId}|${h.directionId}`);
    return { ...h, terminal: terminalStops.has(h.stopId), coordinates: to ? segGeom.get(segmentKey(h.stopId, to)) ?? [] : [] };
  }),
};
writeFileSync(OUT, JSON.stringify(result));
console.log(`dates ${usedDates.length} (${usedDates[0]}..${usedDates[usedDates.length - 1]}), runs matched ${runsMatched}/${runsTotal} (no timetable trip: ${runsUnmatched}), passes ${observations.length}, segments ${stats.length}, headway windows ${windowsKept}/${windowsTotal}, outages ${outages.length}`);
