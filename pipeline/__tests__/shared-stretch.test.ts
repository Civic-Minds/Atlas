import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { oppositeSharedStops, pairOppositeStop } from '../../shared/sharedStops';
import { alignedSharedRuns, qualifyingSharedRuns, SHARED_STRETCH_KEYS } from '../sharedStretch';
import { prepareAgencyRouteFeaturesForTiles } from '../prepareAgencyRoutesForTiles';

// CIV-82 / #690: a feature's stop values count every pattern that serves the stop. Two patterns
// of one route direction pool inside an aligned shared run (at least 5 stops and 1 km) or at
// every common stop when they are same-destination variants. `sharedStretches` records where.

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

/** Stop ids on the feature's shared stretches. */
const stretchStops = (p: any): string[] =>
  (p.sharedStretches ?? []).flatMap((st: any) => p.stopOrder.slice(st.from, st.to + 1));

/** The all-day stop headway at each stop of p, in stop order. */
const stopHwAt = (p: any): Array<number | null> => (p.stopOrder as string[]).map(stopId => p.stopHeadways?.[stopId] ?? null);

/** Every stretch stop has a value, and stretches never list a stop outside stopOrder. */
function expectStretchesSound(routes: any[]): void {
  for (const p of routes) {
    for (const st of p.sharedStretches ?? []) {
      expect(st.from).toBeLessThanOrEqual(st.to);
      expect(st.to).toBeLessThan(p.stopOrder.length);
      expect(st.with.length).toBeGreaterThan(0);
      for (let i = st.from; i <= st.to; i++) expect(p.stopHeadways?.[p.stopOrder[i]]).not.toBeNull();
    }
    // Pre-#690 pooled-value blocks are never written.
    expect(p.sharedStops).toBeUndefined();
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
  /** Minutes after the trip start at each stop (default: one per stop index). */
  at?: number[];
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
      p.stops.forEach((stopId, i) => { const t = start + (p.at?.[i] ?? i); stopTimes.push(`${id},${hm(t)},${hm(t)},${stopId},${i + 1},${p.dropOffOnly?.includes(stopId) ? 1 : 0}`); });
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
    const a = ['s0', 's1', 's2', 's3', 's4', 's5', 'x'];
    expect(alignedSharedRuns(a, ['s0', 's1', 's2', 's3', 's4', 's5', 'y'])).toEqual([[0, 5]]);
    // Reversed order never aligns beyond single stops.
    expect(alignedSharedRuns(a, ['s5', 's4', 's3', 's2', 's1', 's0'])).toEqual([]);
    // A skipped stop splits the run.
    expect(alignedSharedRuns(a, ['s0', 's1', 's2', 's4', 's5'])).toEqual([[0, 2], [4, 5]]);
  });

  it('needs at least 5 shared stops and 1 km', () => {
    const stops = new Map(seq(0, 9).map((id, i) => [id, { lat: 43.6 + i * 0.003, lon: -79.4 }]));
    expect(qualifyingSharedRuns(seq(0, 5), seq(0, 5), stops)).toEqual([[0, 5]]);
    expect(qualifyingSharedRuns(seq(0, 3), seq(0, 3), stops)).toEqual([]);
    // Five stops 100 m apart: under 1 km.
    const close = new Map(seq(0, 9).map((id, i) => [id, { lat: 43.6 + i * 0.0009, lon: -79.4 }]));
    expect(qualifyingSharedRuns(seq(0, 5), seq(0, 5), close)).toEqual([]);
  });
});

describe('shared stretch pooling (synthetic)', () => {
  it('pools two 30-minute branches 15 minutes apart over a long shared stretch', async () => {
    const routes = await weekdayRoutes(await twoBranchFeed({ shared: 8, every: 30, offset: 15 }), 'synthetic');
    expect(routes).toHaveLength(2);
    for (const p of routes) {
      // The headline is the branch's own (different destinations never pool a headline).
      expect(p.headway).toBe(30);
      const other = routes.find(q => q !== p)!;
      expect(p.sharedStretches).toEqual([{ from: 0, to: 7, with: [other.headsign] }]);
      // The shared stops read every 15; the branch's own tail stop stays 30.
      expect(stopHwAt(p)).toEqual([15, 15, 15, 15, 15, 15, 15, 15, 30]);
      expect(p.stopPeriodHeadways.s0.midday).toBe(15);
      expect(p.stopPeriodCoverageHeadways.s0.midday).toBeLessThan(30);
      // Segments: the stretch at tier 15, the tail at 30.
      expect(p.segments).toEqual([{ from: 0, to: 7, tier: '15', headway: 15 }, { from: 8, to: 8, tier: '30', headway: 30 }]);
      // The route-level minimums keep the own pattern, so the filter never passes on the stretch.
      expect(p.minStopHeadway).toBe(30);
      expect(p.minStopHeadwayByPeriod.midday).toBe(30);
    }
    expectStretchesSound(routes);
  });

  it('does not pool two 30-minute branches that share only 3 stops', async () => {
    const routes = await weekdayRoutes(await twoBranchFeed({ shared: 3, every: 30, offset: 15 }), 'synthetic');
    expect(routes).toHaveLength(2);
    for (const p of routes) {
      for (const key of SHARED_STRETCH_KEYS) expect(p[key]).toBeUndefined();
      expect(new Set(stopHwAt(p))).toEqual(new Set([30]));
    }
  });

  it('reads the long gap for a bunched shared stretch (two 30s three minutes apart)', async () => {
    // Gaps 3, 27, 3, 27: not a 15-minute service. The 27-minute gap is over 1.75 times the mean,
    // so no pooled value is published (pooledHeadwayInWindow) and every stop keeps its own 30.
    // The stretch is still recorded.
    const routes = await weekdayRoutes(await twoBranchFeed({ shared: 8, every: 30, offset: 3 }), 'synthetic');
    expect(routes).toHaveLength(2);
    for (const p of routes) {
      expect(p.sharedStretches).toHaveLength(1);
      expect(stopHwAt(p)).toEqual([30, 30, 30, 30, 30, 30, 30, 30, 30]);
      expect(p.headway).toBe(30);
    }
    expectStretchesSound(routes);
  });
});

describe('shared stretch pooling (patterns)', () => {
  const routesOf = async (patterns: Pattern[], extra?: Record<string, [number, number]>) => weekdayRoutes(await patternFeed(patterns, extra), 'synthetic');

  it('never claims better than the typical gap (branches alternating 14/18 read 16, not 14)', async () => {
    // Two 32-minute branches 14 minutes apart: gaps 14, 18, 14, 18 ... median 16.
    const routes = await routesOf([
      { id: 'A', direction: 0, headsign: 'To A', stops: [...seq(0, 7), 'a1'], every: 32 },
      { id: 'B', direction: 0, headsign: 'To B', stops: [...seq(0, 7), 'b1'], every: 32, offset: 14 },
    ], { a1: [43.624, -79.39], b1: [43.624, -79.41] });
    for (const p of routes) {
      expect(stretchStops(p)).toEqual(seq(0, 7));
      expect(new Set(stretchStops(p).map(s => p.stopHeadways[s]))).toEqual(new Set([16]));
    }
    expectStretchesSound(routes);
  });

  it('counts a loop trip once per stop (first visit)', async () => {
    // A loops back through s0 at the end of every trip; B is a plain branch 15 minutes later.
    const routes = await routesOf([
      { id: 'A', direction: 0, headsign: 'Loop', stops: [...seq(0, 7), 'a1', 's0'], every: 30 },
      { id: 'B', direction: 0, headsign: 'To B', stops: [...seq(0, 7), 'b1'], every: 30, offset: 15 },
    ], { a1: [43.624, -79.39], b1: [43.624, -79.41] });
    for (const p of routes) {
      for (const stopId of seq(0, 7)) if (p.stopHeadways[stopId] != null) expect(p.stopHeadways[stopId]).toBe(15);
    }
    expect(routes.some(p => p.stopHeadways.s0 === 15)).toBe(true);
    expectStretchesSound(routes);
  });

  it('does not pool opposite travel directions lumped together without direction_id', async () => {
    const routes = await routesOf([
      { id: 'O', headsign: 'Outbound', stops: seq(0, 9), every: 30 },
      { id: 'I', headsign: 'Inbound', stops: seq(0, 9).reverse(), every: 30, offset: 15 },
    ]);
    expect(routes.length).toBe(2);
    for (const p of routes) {
      for (const key of SHARED_STRETCH_KEYS) expect(p[key]).toBeUndefined();
      expect(new Set(stopHwAt(p))).toEqual(new Set([30]));
    }
    // Same, with both travel directions filed under one direction_id (NRT-style feeds).
    const lumped = await routesOf([
      { id: 'O', direction: 0, headsign: 'Outbound', stops: seq(0, 9), every: 30 },
      { id: 'I', direction: 0, headsign: 'Inbound', stops: seq(0, 9).reverse(), every: 30, offset: 15 },
    ]);
    expect(lumped.length).toBe(2);
    expect(new Set(lumped.map(p => p.directionId))).toEqual(new Set([0]));
    for (const p of lumped) {
      for (const key of SHARED_STRETCH_KEYS) expect(p[key]).toBeUndefined();
      expect(new Set(stopHwAt(p))).toEqual(new Set([30]));
    }
  });

  it('pools an express with the local only at the stops both serve', async () => {
    const routes = await routesOf([
      { id: 'L', direction: 0, headsign: 'Local', stops: seq(0, 10), every: 30 },
      // The express keeps the local's timing at the stops it serves, so the two stay 15 apart.
      { id: 'X', direction: 0, headsign: 'Express', stops: ['s0', 's2', 's4', 's6', 's8', 's10'], every: 30, offset: 15, at: [0, 2, 4, 6, 8, 10] },
    ]);
    const local = routes.find(p => p.headsign === 'Local')!;
    const express = routes.find(p => p.headsign === 'Express')!;
    // The local's own stretches never cover a stop the express skips, and those stops keep 30.
    for (const stopId of stretchStops(local)) expect(express.stopOrder).toContain(stopId);
    for (const stopId of ['s1', 's3', 's5']) expect(local.stopHeadways[stopId]).toBe(30);
    expect(new Set(stretchStops(express).map(s => express.stopHeadways[s]))).toEqual(new Set([15]));
    expectStretchesSound(routes);
  });

  it('a same-destination variant pools at every common stop; its extra tail stop stays its own', async () => {
    // RTC 219: a few trips use a shape with one extra stop at the end, under the same headsign.
    const routes = await routesOf([
      { id: 'M', direction: 0, headsign: 'Downtown', stops: seq(0, 9), every: 30 },
      { id: 'T', direction: 0, headsign: 'Downtown', stops: [...seq(0, 9), 's10'], every: 60, offset: 15 },
    ]);
    // One destination: dedupe keeps one line and every stop reads the whole destination: gaps
    // 15, 15, 30, mean 20 (19 where the 9-15h window cuts the terminal's list to 17 gaps), and
    // the headline is the worst stop on the drawn line (#771).
    expect(routes).toHaveLength(1);
    const line = routes[0];
    expect([19, 20]).toContain(line.headway);
    for (const stopId of line.stopOrder.slice(0, 10)) expect([19, 20]).toContain(line.stopHeadways[stopId]);
    expectStretchesSound(routes);
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
    const pick = (routes: any[]) => routes.filter(p => p.headsign === 'A').map(stopHwAt);
    expect(pick(withExtra)).toEqual(pick(without));
    // B drops off only at s4..s7: A alone picks up there, so nothing pools there.
    const dropping = await routesOf([
      base[0],
      { ...base[1], dropOffOnly: ['s4', 's5', 's6', 's7'] },
    ], extra);
    const a = dropping.find(p => p.headsign === 'A')!;
    for (const stopId of ['s4', 's5', 's6', 's7']) expect(a.stopHeadways[stopId]).toBe(30);
    for (const stopId of ['s0', 's1', 's2', 's3']) expect(a.stopHeadways[stopId]).toBe(15);
    expectStretchesSound(dropping);
  });
});

describe('shared stretch pooling (real feeds)', () => {
  // Cut from the 2026-10 feeds: one weekday, every 5th stop (2nd for Niagara), thinned shapes.
  it('TTC 29 Dufferin: 29A and 29C every 16 each give every 8 on the shared stops; the 29C tail keeps 16', async () => {
    const routes = await weekdayRoutes(await fixtureZip('ttc-29-dufferin'), 'ttc');
    const south = routes.filter(p => p.directionId === 0);
    expect(south).toHaveLength(2);
    // Different destinations: each branch keeps its own headline.
    for (const p of south) expect(p.headway).toBe(16);
    const a = south.find(p => p.headsign === 'Exhibition (Dufferin Gate)')!;
    const c = south.find(p => p.headsign === "Exhibition (Princes' Gates)")!;
    // 29A's last stop is drop-off only (pickup_type 1), so it pools nothing.
    expect(stopHwAt(a).slice(0, -1)).toEqual(a.stopOrder.slice(0, -1).map(() => 8));
    // 29C: 29A's stops, then a tail only 29C serves.
    const shared = c.stopOrder.filter((s: string) => a.stopOrder.slice(0, -1).includes(s));
    const tail = c.stopOrder.filter((s: string) => !a.stopOrder.includes(s));
    expect(tail.length).toBeGreaterThan(0);
    expect(shared.map((s: string) => c.stopHeadways[s])).toEqual(shared.map(() => 8));
    for (const s of tail) expect(c.stopHeadways[s]).toBe(16);
    // The line is cut where the service changes.
    expect(c.segments.length).toBeGreaterThanOrEqual(2);
    expect(c.segments[0]).toMatchObject({ from: 0, tier: '10', headway: 8 });
    expect(c.segments.at(-1).tier).toBe('20');
    expectStretchesSound(routes);
    // Northbound has one "Wilson" feature whose trips run on both shapes. The stops both serve
    // read the whole destination (8, #690); the 29C-only stops get every 16, and the headline is
    // the worst drawn stop's, 16 (#771: a pooled headline never overstates part of the line).
    const north = routes.filter(p => p.directionId === 1);
    expect(north).toHaveLength(1);
    expect(north[0].headway).toBe(16);
    const pooled = stopHwAt(north[0]).filter(v => v === 8);
    expect(pooled.length).toBeGreaterThanOrEqual(north[0].stopOrder.length - 3);
    // Phase 2 pairs each pooled stop with an opposite-direction stop on read.
    const result = await processGtfsBuffer(await fixtureZip('ttc-29-dufferin'), undefined, { slug: 'ttc' });
    const coords = new Map<string, { lat: number; lon: number }>(JSON.parse(result.geojson).features
      .filter((f: any) => f.properties.stopId != null)
      .map((f: any) => [f.properties.stopId, { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }]));
    // Candidates are the southbound shared-stretch stops only (oppositeSharedStops), so the
    // 29C-only southern tail can never pair: no pairing across the branch point.
    const southStops = oppositeSharedStops(routes, north[0]);
    for (const s of tail) expect(southStops).not.toContain(s);
    const sharedSouth = new Set(south.flatMap(stretchStops));
    expect(new Set(southStops)).toEqual(sharedSouth);
    let paired = 0;
    for (const stopId of north[0].stopOrder as string[]) {
      const o = pairOppositeStop(stopId, southStops, coords);
      if (o == null) continue;
      paired++;
      expect(sharedSouth.has(o)).toBe(true);
    }
    expect(paired).toBeGreaterThan(0);
  });

  it('TTC 29 at real stop spacing (every stop, trips starting 6-11 AM): AM every 8 on the shared stops', async () => {
    const routes = await weekdayRoutes(await fixtureZip('ttc-29-dufferin-full'), 'ttc');
    const south = routes.filter(p => p.directionId === 0);
    const a = south.find(p => p.headsign === 'Exhibition (Dufferin Gate)')!;
    expect(a.stopOrder.length).toBeGreaterThan(40);
    const am = a.stopOrder.slice(0, -1).map((stopId: string) => a.stopPeriodHeadways[stopId]?.amPeak);
    expect(am.filter((v: unknown) => v === 8).length).toBeGreaterThanOrEqual(a.stopOrder.length - 3);
    expectStretchesSound(routes);
  });

  it('HSR 01 King: the shared trunk pools to every 6', async () => {
    const routes = await weekdayRoutes(await fixtureZip('hsr-01-king'), 'hamilton');
    // Eastbound: one destination (Eastgate Square) on two shapes, every 12 each. Every common
    // stop reads the whole destination, 6 (#690), and there is no shared stretch (a
    // same-destination variant is the same line). The stops only one shape serves get every 12,
    // so the headline is 12 (#771: the worst drawn stop).
    const east = routes.filter(p => p.directionId === 0);
    expect(east).toHaveLength(1);
    expect(east[0].headway).toBe(12);
    expect(east[0].sharedStretches).toBeUndefined();
    expect(Object.values(east[0].stopHeadways).filter(v => v === 6).length).toBeGreaterThanOrEqual(9);
    // Westbound: two destinations every 12 each share the trunk, which pools to every 6.
    const west = routes.filter(p => p.directionId === 1);
    expect(west).toHaveLength(2);
    for (const p of west) {
      expect(p.headway).toBe(12);
      const pooled = stretchStops(p).map(s => p.stopHeadways[s]);
      expect(pooled.length).toBeGreaterThanOrEqual(9);
      expect(new Set(pooled)).toEqual(new Set([6]));
    }
    expectStretchesSound(routes);
  });

  it('DRT 900 Pulse: two branches every 24 pool to their typical gap, never the short median gap', async () => {
    const routes = await weekdayRoutes(await fixtureZip('drt-900-pulse'), 'drt');
    const west = routes.filter(p => p.directionId === 1);
    expect(west).toHaveLength(2);
    for (const p of west) {
      expect(p.sharedStretches.length).toBeGreaterThanOrEqual(1);
      expect(p.sharedStretches[0].from).toBe(0);
      // Near the start the gaps alternate 12/12, 11/13, 10/14; further on they drift to 9/15
      // and 8/16. typicalOfGaps reads the mean of an alternation, so no shared stop ever reads
      // better than every 12 (the median alone would say 7 to 9).
      const pooled = stretchStops(p).map(s => p.stopHeadways[s]);
      expect(pooled.slice(0, 4)).toEqual([12, 12, 12, 12]);
      expect(pooled.every(v => v >= 12)).toBe(true);
    }
    expectStretchesSound(routes);
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
    // The line segments ride along (#690).
    expect(tiles.some((f: any) => f.properties.segments)).toBe(true);
  });
});
