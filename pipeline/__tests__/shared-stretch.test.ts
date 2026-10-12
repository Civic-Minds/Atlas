import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { PERIOD_KEYS } from '../../shared/config';
import { buildSharedStopIndex, getPooledStop, pairOppositeStop } from '../../shared/sharedStops';
import { alignedSharedRuns, pooledStopMetrics, qualifyingSharedRuns, SHARED_STRETCH_KEYS } from '../sharedStretch';
import { prepareAgencyRouteFeaturesForTiles } from '../prepareAgencyRoutesForTiles';

// CIV-82: pooled values at stops a route direction's patterns really share. Stop departures
// stay pooled per shape (#241); these are new keys only, and only on shared stretches.

const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekdayRoutes(buf: Buffer, slug: string): Promise<any[]> {
  const result = await processGtfsBuffer(buf, undefined, { slug });
  return JSON.parse(result.geojson).features
    .filter((f: any) => f.geometry.type === 'LineString' && f.properties.day === 'Weekday')
    .map((f: any) => f.properties);
}

/** The pooled all-day value at each stop of p, as phase 2 reads it (null = use p's own). */
const pooledAt = (routes: any[], p: any) => {
  const index = buildSharedStopIndex(routes);
  return (p.stopOrder as string[]).map(stopId => getPooledStop(index, p, stopId, 'headway') ?? null);
};

/** Read-side invariants: every value getPooledStop returns is strictly lower than the feature's own. */
function expectNeverWorse(routes: any[]): void {
  const index = buildSharedStopIndex(routes);
  for (const p of routes) {
    for (const stopId of p.stopOrder ?? []) {
      const hw = getPooledStop(index, p, stopId, 'headway');
      if (hw !== undefined && p.stopHeadways?.[stopId] != null) expect(hw).toBeLessThan(p.stopHeadways[stopId]);
      for (const pk of PERIOD_KEYS) {
        const median = getPooledStop(index, p, stopId, `median:${pk}`);
        const coverage = getPooledStop(index, p, stopId, `coverage:${pk}`);
        const sustained = getPooledStop(index, p, stopId, `sustained:${pk}`);
        const own = p.stopPeriodHeadways?.[stopId]?.[pk];
        if (median !== undefined && own != null) expect(median).toBeLessThan(own);
        if (coverage !== undefined) {
          expect(median).not.toBeUndefined();
          const ownCoverage = p.stopPeriodCoverageHeadways?.[stopId]?.[pk];
          if (ownCoverage != null) expect(coverage).toBeLessThan(ownCoverage);
        }
        expect(sustained === undefined).toBe(median === undefined);
      }
    }
  }
  // Storage: one block per route/direction/day, coverage only with a median.
  const carriers = routes.filter(p => p.sharedStops);
  expect(new Set(carriers.map(p => `${p.routeId}|${p.directionId}|${p.day}`)).size).toBe(carriers.length);
  for (const p of carriers) {
    for (const stop of Object.values<any>(p.sharedStops)) {
      expect(stop.headway != null || stop.periods != null).toBe(true);
      (stop.coverage ?? []).forEach((v: number | null, i: number) => { if (v != null) expect(stop.periods?.[i]).not.toBeNull(); });
    }
  }
}

/**
 * Pipeline-side checks on the RAW stored block, independent of getPooledStop:
 * every stored value is strictly lower than the own value of at least one feature whose
 * stretch covers the stop, and every stretch stop offers its feature a strictly lower value.
 */
function expectRawBlockSound(routes: any[]): void {
  const lower = (v: number | null | undefined, own: number | null | undefined) => v != null && (own == null || v < own);
  const blocks = new Map<string, Record<string, any>>();
  for (const p of routes) if (p.sharedStops) blocks.set(`${p.routeId}|${p.directionId}|${p.day}`, p.sharedStops);
  const readers = (key: string, stopId: string) => routes.filter(p => `${p.routeId}|${p.directionId}|${p.day}` === key
    && (p.sharedStretches ?? []).some((st: any) => p.stopOrder.slice(st.from, st.to + 1).includes(stopId)));
  for (const [key, block] of blocks) {
    for (const [stopId, stop] of Object.entries<any>(block)) {
      const rs = readers(key, stopId);
      expect(rs.length).toBeGreaterThan(0);
      if (stop.headway != null) expect(rs.some(p => lower(stop.headway, p.stopHeadways?.[stopId]))).toBe(true);
      PERIOD_KEYS.forEach((pk, i) => {
        const median = stop.periods?.[i];
        if (median != null) expect(rs.some(p => lower(median, p.stopPeriodHeadways?.[stopId]?.[pk]))).toBe(true);
        const coverage = stop.coverage?.[i];
        if (coverage != null) {
          expect(median).not.toBeNull();
          expect(rs.some(p => lower(coverage, p.stopPeriodCoverageHeadways?.[stopId]?.[pk]))).toBe(true);
        }
        if (stop.unsustained?.includes(pk)) {
          expect(median).not.toBeNull();
          expect(rs.some(p => p.headwayByPeriodSustained?.[pk] !== true)).toBe(true);
        }
      });
    }
  }
  for (const p of routes) {
    const block = blocks.get(`${p.routeId}|${p.directionId}|${p.day}`);
    for (const st of p.sharedStretches ?? []) {
      expect(block).toBeDefined();
      for (let i = st.from; i <= st.to; i++) {
        const stopId = p.stopOrder[i];
        const stop = block![stopId];
        expect(stop).toBeDefined();
        const better = lower(stop.headway, p.stopHeadways?.[stopId])
          || PERIOD_KEYS.some((pk, k) => lower(stop.periods?.[k], p.stopPeriodHeadways?.[stopId]?.[pk]));
        expect(better).toBe(true);
      }
    }
  }
}

type Pattern = {
  id: string;
  headsign: string;
  stops: string[];
  every: number;
  offset?: number;
  /** Omitted direction_id column when every pattern leaves it undefined. */
  direction?: number;
  /** Stop ids where the pattern only drops off (pickup_type 1). */
  dropOffOnly?: string[];
  start?: number;
  end?: number;
};

/** Synthetic one-route feed from stop patterns. Stop sN sits ~330 m north of sN-1; others get explicit coords. */
async function patternFeed(patterns: Pattern[], extraStops: Record<string, [number, number]> = {}): Promise<Buffer> {
  const zip = new JSZip();
  const coord = (id: string): [number, number] => extraStops[id] ?? [43.6 + Number(id.slice(1)) * 0.003, -79.4];
  const ids = [...new Set(patterns.flatMap(p => p.stops))];
  const withDirection = patterns.some(p => p.direction != null);
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Pattern Transit,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,7,Main,3\n');
  zip.file('stops.txt', ['stop_id,stop_name,stop_lat,stop_lon', ...ids.map(id => `${id},Stop ${id},${coord(id)[0].toFixed(5)},${coord(id)[1]}`)].join('\n') + '\n');
  zip.file('shapes.txt', ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    ...patterns.flatMap(p => p.stops.map((id, i) => `sh${p.id},${coord(id)[0].toFixed(5)},${coord(id)[1]},${i + 1}`))].join('\n') + '\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20260101,20271231\n');
  const trips = [`route_id,service_id,trip_id,trip_headsign,${withDirection ? 'direction_id,' : ''}shape_id`];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type'];
  for (const p of patterns) {
    for (let start = (p.start ?? 6 * 60) + (p.offset ?? 0); start <= (p.end ?? 22 * 60); start += p.every) {
      const id = `${p.id}-${start}`;
      trips.push(`r1,wk,${id},${p.headsign},${withDirection ? `${p.direction ?? 0},` : ''}sh${p.id}`);
      p.stops.forEach((stopId, i) => stopTimes.push(`${id},${hm(start + i)},${hm(start + i)},${stopId},${i + 1},${p.dropOffOnly?.includes(stopId) ? 1 : 0}`));
    }
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

const seq = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `s${from + i}`);

function hm(mins: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;
}

/**
 * One route, one direction, two headsigns. Stops are ~330 m apart on a straight line.
 * Branch A serves stops 0..(shared-1) then a, branch B the same shared stops then b.
 */
async function twoBranchFeed(opts: { shared: number; every: number; offset: number }): Promise<Buffer> {
  const zip = new JSZip();
  const lat = (i: number) => (43.6 + i * 0.003).toFixed(5);
  const shared = Array.from({ length: opts.shared }, (_, i) => `s${i}`);
  const stops = [...shared.map((id, i) => `${id},Stop ${i},${lat(i)},-79.4`),
    `a1,A end,${lat(opts.shared)},-79.39`, `b1,B end,${lat(opts.shared)},-79.41`];
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Branch Transit,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,7,Main,3\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\n' + stops.join('\n') + '\n');
  const shape = (id: string, endLon: string) => [
    ...shared.map((_, i) => `${id},${lat(i)},-79.4,${i + 1}`),
    `${id},${lat(opts.shared)},${endLon},${opts.shared + 1}`,
  ];
  zip.file('shapes.txt', ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence', ...shape('shA', '-79.39'), ...shape('shB', '-79.41')].join('\n') + '\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20260101,20271231\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (const [branch, end, offset] of [['A', 'a1', 0], ['B', 'b1', opts.offset]] as const) {
    for (let start = 6 * 60 + offset; start <= 22 * 60; start += opts.every) {
      const id = `${branch}-${start}`;
      trips.push(`r1,wk,${id},To ${branch},0,sh${branch}`);
      [...shared, end].forEach((stopId, i) => stopTimes.push(`${id},${hm(start + i)},${hm(start + i)},${stopId},${i + 1}`));
    }
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('shared stretch helpers', () => {
  it('aligns runs only where the other pattern serves the stops in the same order', () => {
    expect(alignedSharedRuns(['a', 'b', 'c', 'x', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'])).toEqual([[0, 2], [4, 5]]);
    // Opposite order: no run longer than one stop.
    expect(alignedSharedRuns(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual([]);
    // A platform and its parent station repeat as one station key and continue the run.
    expect(alignedSharedRuns(['P1', 'P1', 'P2', 'P2', 'P3'], ['P1', 'P2', 'P3'])).toEqual([[0, 4]]);
  });

  it('needs at least 5 shared stops and 1 km', () => {
    const stops = new Map(Array.from({ length: 8 }, (_, i) => [`s${i}`, { lat: 43.6 + i * 0.003, lon: -79.4 }]));
    const ids = [...stops.keys()];
    expect(qualifyingSharedRuns(ids.slice(0, 4), ids, stops)).toEqual([]); // 4 stops
    expect(qualifyingSharedRuns(ids.slice(0, 5), ids, stops)).toEqual([[0, 4]]); // 5 stops, ~1.3 km
    const close = new Map(ids.map((id, i) => [id, { lat: 43.6 + i * 0.0005, lon: -79.4 }]));
    expect(qualifyingSharedRuns(ids, ids, close)).toEqual([]); // 8 stops, ~0.4 km
  });

  it('drops a pooled median whose gaps are uneven (two 30s three minutes apart)', () => {
    const branch = (offset: number) => Array.from({ length: 33 }, (_, i) => 360 + offset + i * 30);
    const even = pooledStopMetrics([...branch(0), ...branch(15)]);
    expect(even.headway).toBe(15);
    expect(even.byPeriod.midday).toBe(15);
    const bunched = pooledStopMetrics([...branch(0), ...branch(3)]);
    expect(bunched.headway).toBeNull();
    expect(bunched.byPeriod.midday).toBeUndefined();
    // Coverage is published as computed: the longest wait in the period.
    expect(bunched.coverage.midday).toBe(27);
  });
});

describe('shared stretch pooling (synthetic)', () => {
  it('pools two 30-minute branches 15 minutes apart over a long shared stretch', async () => {
    const routes = await weekdayRoutes(await twoBranchFeed({ shared: 8, every: 30, offset: 15 }), 'synthetic');
    expect(routes).toHaveLength(2);
    for (const p of routes) {
      expect(p.headway).toBe(30);
      expect(Object.values(p.stopHeadways)).toEqual(p.stopOrder.map(() => 30));
      const other = routes.find(q => q !== p)!;
      expect(p.sharedStretches).toEqual([{ from: 0, to: 7, with: [other.headsign] }]);
      expect(pooledAt(routes, p)).toEqual([15, 15, 15, 15, 15, 15, 15, 15, null]);
      const index = buildSharedStopIndex(routes);
      expect(getPooledStop(index, p, 's0', 'median:midday')).toBe(15);
      expect(getPooledStop(index, p, 's0', 'sustained:midday')).toBe(true);
      expect(getPooledStop(index, p, 's0', 'coverage:midday')).toBeLessThan(30);
    }
    expectNeverWorse(routes);
    expectRawBlockSound(routes);
  });

  it('does not pool two 30-minute branches that share only 3 stops', async () => {
    const routes = await weekdayRoutes(await twoBranchFeed({ shared: 3, every: 30, offset: 15 }), 'synthetic');
    expect(routes).toHaveLength(2);
    for (const p of routes) for (const key of SHARED_STRETCH_KEYS) expect(p[key]).toBeUndefined();
  });

  it('publishes nothing for a bunched shared stretch (two 30s three minutes apart)', async () => {
    const routes = await weekdayRoutes(await twoBranchFeed({ shared: 8, every: 30, offset: 3 }), 'synthetic');
    expect(routes).toHaveLength(2);
    for (const p of routes) for (const key of SHARED_STRETCH_KEYS) expect(p[key]).toBeUndefined();
  });
});

describe('shared stretch pooling (patterns)', () => {
  const routesOf = async (patterns: Pattern[], extra?: Record<string, [number, number]>) => weekdayRoutes(await patternFeed(patterns, extra), 'synthetic');

  it('never claims better than the average gap (branches alternating 14/18 read 16, not 14)', async () => {
    // Two 32-minute branches 14 minutes apart: gaps 14, 18, 14, 18 ... median 14 (or 16), mean 16.
    const routes = await routesOf([
      { id: 'A', direction: 0, headsign: 'To A', stops: [...seq(0, 7), 'a1'], every: 32 },
      { id: 'B', direction: 0, headsign: 'To B', stops: [...seq(0, 7), 'b1'], every: 32, offset: 14 },
    ], { a1: [43.624, -79.39], b1: [43.624, -79.41] });
    for (const p of routes) {
      const pooled = pooledAt(routes, p).filter(v => v != null);
      expect(pooled.length).toBeGreaterThan(0);
      expect(pooled.every(v => v! >= 16)).toBe(true);
    }
    expectRawBlockSound(routes);
  });

  it('counts a loop trip once per stop (first visit)', async () => {
    // A loops back through s0 at the end of every trip; B is a plain branch 15 minutes later.
    const routes = await routesOf([
      { id: 'A', direction: 0, headsign: 'Loop', stops: [...seq(0, 7), 'a1', 's0'], every: 30 },
      { id: 'B', direction: 0, headsign: 'To B', stops: [...seq(0, 7), 'b1'], every: 30, offset: 15 },
    ], { a1: [43.624, -79.39], b1: [43.624, -79.41] });
    const index = buildSharedStopIndex(routes);
    for (const p of routes) {
      for (const stopId of seq(0, 7)) {
        const v = getPooledStop(index, p, stopId, 'headway');
        if (v !== undefined) expect(v).toBe(15);
      }
    }
    expect(routes.some(p => getPooledStop(index, p, 's0', 'headway') === 15)).toBe(true);
    expectRawBlockSound(routes);
  });

  it('does not pool opposite travel directions lumped together without direction_id', async () => {
    const routes = await routesOf([
      { id: 'O', headsign: 'Outbound', stops: seq(0, 9), every: 30 },
      { id: 'I', headsign: 'Inbound', stops: seq(0, 9).reverse(), every: 30, offset: 15 },
    ]);
    expect(routes.length).toBe(2);
    for (const p of routes) for (const key of SHARED_STRETCH_KEYS) expect(p[key]).toBeUndefined();
    // Same, with both travel directions filed under one direction_id (NRT-style feeds).
    const lumped = await routesOf([
      { id: 'O', direction: 0, headsign: 'Outbound', stops: seq(0, 9), every: 30 },
      { id: 'I', direction: 0, headsign: 'Inbound', stops: seq(0, 9).reverse(), every: 30, offset: 15 },
    ]);
    expect(lumped.length).toBe(2);
    expect(new Set(lumped.map(p => p.directionId))).toEqual(new Set([0]));
    for (const p of lumped) for (const key of SHARED_STRETCH_KEYS) expect(p[key]).toBeUndefined();
  });

  it('pools an express with the local only at the stops both serve', async () => {
    const routes = await routesOf([
      { id: 'L', direction: 0, headsign: 'Local', stops: seq(0, 10), every: 30 },
      { id: 'X', direction: 0, headsign: 'Express', stops: ['s0', 's2', 's4', 's6', 's8', 's10'], every: 30, offset: 15 },
    ]);
    const index = buildSharedStopIndex(routes);
    const local = routes.find(p => p.headsign === 'Local')!;
    const express = routes.find(p => p.headsign === 'Express')!;
    // The local's own stretches never cover a stop the express skips.
    for (const st of local.sharedStretches ?? []) {
      for (const stopId of local.stopOrder.slice(st.from, st.to + 1)) expect(express.stopOrder).toContain(stopId);
    }
    for (const stopId of ['s1', 's3', 's5']) expect(getPooledStop(index, local, stopId, 'headway')).toBeUndefined();
    expect(pooledAt(routes, express).filter(v => v != null).every(v => v === 15)).toBe(true);
    expectRawBlockSound(routes);
  });

  it('leaves out drop-off-only headsigns and drop-off-only stop times', async () => {
    const base = [
      { id: 'A', direction: 0, headsign: 'To A', stops: [...seq(0, 7), 'a1'], every: 30 },
      { id: 'B', direction: 0, headsign: 'To B', stops: [...seq(0, 7), 'b1'], every: 30, offset: 15 },
    ];
    const extra: Record<string, [number, number]> = { a1: [43.624, -79.39], b1: [43.624, -79.41] };
    const without = await routesOf(base, extra);
    const withExtra = await routesOf([
      ...base,
      // Every 10 on the same stops: would pool to about every 6 if it counted.
      { id: 'D', direction: 0, headsign: 'Drop Off Only', stops: seq(0, 7), every: 10, offset: 5 },
    ], extra);
    const pick = (routes: any[]) => routes.filter(p => p.headsign === 'A').map(p => pooledAt(routes, p));
    expect(pick(withExtra)).toEqual(pick(without));
    // B drops off only at s4..s7: A alone picks up there, so nothing pools there.
    const dropping = await routesOf([
      base[0],
      { ...base[1], dropOffOnly: ['s4', 's5', 's6', 's7'] },
    ], extra);
    const index = buildSharedStopIndex(dropping);
    const a = dropping.find(p => p.headsign === 'A')!;
    for (const stopId of ['s4', 's5', 's6', 's7']) expect(getPooledStop(index, a, stopId, 'headway')).toBeUndefined();
    expectRawBlockSound(dropping);
  });
});

describe('shared stretch pooling (real feeds)', () => {
  // Cut from the 2026-10 feeds: one weekday, every 5th stop (2nd for Niagara), thinned shapes.
  it('TTC 29 Dufferin: 29A and 29C every 16 each give every 8 on the shared stops; the 29C tail keeps 16', async () => {
    const routes = await weekdayRoutes(await fixtureZip('ttc-29-dufferin'), 'ttc');
    const south = routes.filter(p => p.directionId === 0);
    expect(south).toHaveLength(2);
    for (const p of south) {
      expect(p.headway).toBe(16);
      expect(new Set(Object.values(p.stopHeadways))).toEqual(new Set([16]));
    }
    const a = south.find(p => p.headsign === 'Exhibition (Dufferin Gate)')!;
    const c = south.find(p => p.headsign === "Exhibition (Princes' Gates)")!;
    // 29A's last stop is drop-off only (pickup_type 1), so it pools nothing.
    expect(pooledAt(routes, a).slice(0, -1)).toEqual(a.stopOrder.slice(0, -1).map(() => 8));
    // 29C: 29A's stops, then a tail only 29C serves.
    // 29A only drops off at its last stop, so only 29C picks up there: not pooled.
    const shared = c.stopOrder.filter((s: string) => a.stopOrder.slice(0, -1).includes(s));
    const tail = c.stopOrder.filter((s: string) => !a.stopOrder.includes(s));
    expect(tail.length).toBeGreaterThan(0);
    expect(shared.map((s: string) => pooledAt(routes, c)[c.stopOrder.indexOf(s)])).toEqual(shared.map(() => 8));
    // The tail's pooled value is not lower than 16, so nothing is published there.
    for (const s of tail) expect(pooledAt(routes, c)[c.stopOrder.indexOf(s)] ?? c.stopHeadways[s]).toBe(16);
    // Stored once for the direction, on one carrier feature.
    expect(south.filter(p => p.sharedStops)).toHaveLength(1);
    expectNeverWorse(routes);
    expectRawBlockSound(routes);
    // Northbound has one "Wilson" feature, but its trips run on both shapes.
    const north = routes.filter(p => p.directionId === 1);
    expect(north).toHaveLength(1);
    const pooled = pooledAt(routes, north[0]).filter(v => v != null);
    expect(pooled.length).toBeGreaterThanOrEqual(north[0].stopOrder.length - 3);
    expect(new Set(pooled)).toEqual(new Set([8]));
    // Phase 2 pairs each pooled stop with an opposite-direction stop on read.
    const result = await processGtfsBuffer(await fixtureZip('ttc-29-dufferin'), undefined, { slug: 'ttc' });
    const coords = new Map<string, { lat: number; lon: number }>(JSON.parse(result.geojson).features
      .filter((f: any) => f.properties.stopId != null)
      .map((f: any) => [f.properties.stopId, { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }]));
    const southStops = [...new Set(south.flatMap(p => p.stopOrder))] as string[];
    const northStops = north[0].stopOrder as string[];
    let paired = 0;
    for (const stopId of northStops) {
      const o = pairOppositeStop(stopId, southStops, coords);
      if (o == null) continue;
      paired++;
      expect(southStops).toContain(o);
    }
    expect(paired).toBeGreaterThan(0);
  });

  it('TTC 29 at real stop spacing (every stop, trips starting 6-11 AM): AM every 8 on the shared stops', async () => {
    const routes = await weekdayRoutes(await fixtureZip('ttc-29-dufferin-full'), 'ttc');
    const index = buildSharedStopIndex(routes);
    const south = routes.filter(p => p.directionId === 0);
    const a = south.find(p => p.headsign === 'Exhibition (Dufferin Gate)')!;
    expect(a.stopOrder.length).toBeGreaterThan(40);
    const am = a.stopOrder.slice(0, -1).map((stopId: string) => getPooledStop(index, a, stopId, 'median:amPeak'));
    expect(am.filter((v: unknown) => v === 8).length).toBeGreaterThanOrEqual(a.stopOrder.length - 3);
    expect(am.every((v: unknown) => v == null || v === 8)).toBe(true);
    expectNeverWorse(routes);
    expectRawBlockSound(routes);
  });

  it('HSR 01 King: the shared trunk pools to every 6', async () => {
    const routes = await weekdayRoutes(await fixtureZip('hsr-01-king'), 'hamilton');
    for (const p of routes) {
      expect(p.headway).toBe(12);
      const pooled = pooledAt(routes, p).filter(v => v != null);
      expect(pooled.length).toBeGreaterThanOrEqual(9);
      expect(new Set(pooled)).toEqual(new Set([6]));
    }
    expectNeverWorse(routes);
    expectRawBlockSound(routes);
  });

  it('DRT 900 Pulse: two branches every 24 pool to their average gap, never the short median gap', async () => {
    const routes = await weekdayRoutes(await fixtureZip('drt-900-pulse'), 'drt');
    const west = routes.filter(p => p.directionId === 1);
    expect(west).toHaveLength(2);
    for (const p of west) {
      // Stretches cover the stops with a published value; further on, some periods still
      // interleave evenly enough to publish, so there can be more than one.
      expect(p.sharedStretches.length).toBeGreaterThanOrEqual(1);
      expect(p.sharedStretches[0].from).toBe(0);
      // Even near the start (12/12, 11/13, 10/14 gaps); further on the gaps drift to
      // 9/15 and 8/16, and the guard leaves those stops without a pooled headway.
      const pooled = pooledAt(routes, p);
      // max(median, mean gap): the 11/13 and 10/14 alternations read 12, not 11 or 10.
      expect(pooled.slice(0, 4)).toEqual([12, 12, 12, 12]);
      // Further on the gaps drift to 9/15, 8/16 and 7/17: the average stays 12, so no pooled
      // value ever reads better than every 12 (the median alone would say 7 to 9).
      expect(pooled.filter(v => v != null).every(v => v! >= 12)).toBe(true);
    }
    expectNeverWorse(routes);
    expectRawBlockSound(routes);
  });

  it('Niagara 301/401: unrelated patterns that meet only at the hospital do not pool (#241)', async () => {
    const routes = await weekdayRoutes(await fixtureZip('niagara-301-401'), 'niagara');
    expect(routes.length).toBeGreaterThanOrEqual(4);
    for (const p of routes) for (const key of SHARED_STRETCH_KEYS) expect(p[key]).toBeUndefined();
  });
});

describe('tiles', () => {
  it('leave the shared-stretch keys out, so tile properties are unchanged', async () => {
    const result = await processGtfsBuffer(await twoBranchFeed({ shared: 8, every: 30, offset: 15 }), undefined, { slug: 'synthetic' });
    const features = JSON.parse(result.geojson).features;
    expect(features.some((f: any) => f.properties.sharedStretches)).toBe(true);
    const tiles = prepareAgencyRouteFeaturesForTiles(features, 'synthetic');
    for (const f of tiles) for (const key of SHARED_STRETCH_KEYS) expect(f.properties).not.toHaveProperty(key);
  });
});
