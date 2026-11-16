import { describe, expect, it } from 'vitest';
import type { TripRun } from '../vehiclesNeeded.js';
import { cycleMin, isInside, linkRuns, parseRecovery, periodPatterns, targetVehicles, type Places, type TargetOptions } from '../vehiclePatterns.js';

const MIDDAY = { start: 9 * 60, end: 15 * 60 };

/** Stops on a north-south line, about 500 m apart, so shared stretches pass the 1 km bar. */
function places(ids: string[]): Places {
  return { coords: new Map(ids.map((id, i) => [id, { lat: 43 + i * 0.0045, lon: -79 }])) };
}

/**
 * Out-and-back blocks on one pattern: `blocks` buses, a departure every `headway` minutes, each
 * leg `run` minutes with `layover` minutes after it.
 */
function pattern(route: string, stops: string[], blocks: number, headway: number, run: number, layover: number, prefix: string, from = 8 * 60, to = 16 * 60): TripRun[] {
  const out: TripRun[] = [];
  const back = [...stops].reverse();
  const cycle = 2 * (run + layover);
  for (let b = 0; b < blocks; b++) {
    let n = 0;
    for (let t = from + b * headway; t < to; t += cycle) {
      out.push({ tripId: `${prefix}${b}-${n++}`, routeId: route, directionId: '0', blockId: `${prefix}${b}`, firstStop: stops[0], lastStop: stops[stops.length - 1], start: t, end: t + run, stopIds: stops });
      out.push({ tripId: `${prefix}${b}-${n++}`, routeId: route, directionId: '1', blockId: `${prefix}${b}`, firstStop: back[0], lastStop: back[back.length - 1], start: t + run + layover, end: t + 2 * run + layover, stopIds: back });
    }
  }
  return out;
}

const TRUNK = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5'];
const B = [...TRUNK, 'B1', 'B2', 'B3'];
const C = [...TRUNK, 'C1', 'C2', 'C3'];
const branchPlaces = places([...TRUNK, 'B1', 'B2', 'B3']);
for (const [i, id] of ['C1', 'C2', 'C3'].entries()) (branchPlaces.coords as Map<string, { lat: number; lon: number }>).set(id, { lat: 43 + 3 * 0.0045, lon: -79 + (i + 1) * 0.006 });

/** Branch B every 20 (cycle 60, 3 buses); branch C every 40 (cycle 40, 1 bus). */
const branchRuns = [...pattern('R', B, 3, 20, 25, 5, 'b'), ...pattern('R', C, 1, 40, 15, 5, 'c')];

const target = (o: Partial<TargetOptions>): TargetOptions => ({ headwayMin: 10, appliesTo: 'trunk', branchSplit: 'current', shortTurnHeadwayMin: null, recovery: { kind: 'schedule' }, ...o });

describe('layover vs running time', () => {
  it('splits a cycle into running time and the schedule\'s layover', () => {
    const { patterns } = periodPatterns(pattern('R', ['A', 'M1', 'M2', 'B'], 6, 10, 25, 5, 'x'), MIDDAY);
    expect(patterns).toHaveLength(1);
    const [p] = patterns;
    expect(p.runningMin).toBe(50);
    expect(p.layoverMin).toBe(10);
    expect(cycleMin(p, { kind: 'schedule' })).toBe(60);
    expect(p.headwayMin).toBe(10);
    expect(p.scheduledVehicles).toBe(6);
  });

  it('reports layover as not in the feed when there are no blocks', () => {
    const runs = pattern('R', ['A', 'M1', 'M2', 'B'], 2, 30, 25, 5, 'x').map(r => ({ ...r, blockId: null }));
    const [p] = periodPatterns(runs, MIDDAY).patterns;
    expect(p.layoverMin).toBeNull();
    expect(p.notes).toContain('no block data: layover not in feed');
    expect(p.scheduledBasis).toBe('trips');
  });
});

describe('recovery adjustment', () => {
  it('replaces the schedule layover with a share of running time or minutes per leg', () => {
    const [p] = periodPatterns(pattern('R', ['A', 'M1', 'M2', 'B'], 6, 10, 25, 5, 'x'), MIDDAY).patterns;
    expect(cycleMin(p, parseRecovery('20%'))).toBe(60);
    expect(cycleMin(p, parseRecovery('8'))).toBe(66);
    expect(cycleMin(p, parseRecovery('schedule'))).toBe(60);
    expect(() => parseRecovery('lots')).toThrow();
  });
});

describe('deadheads', () => {
  it('flags a next trip that starts away from where the last one ended, and pull-outs', () => {
    const runs: TripRun[] = [
      { tripId: '1', routeId: 'R', directionId: '0', blockId: 'K', firstStop: 'A', lastStop: 'B', start: 600, end: 630 },
      { tripId: '2', routeId: 'R', directionId: '1', blockId: 'K', firstStop: 'Z', lastStop: 'A', start: 640, end: 670 },
      { tripId: '3', routeId: 'R', directionId: '0', blockId: 'K', firstStop: 'A', lastStop: 'B', start: 675, end: 705 },
    ];
    const links = linkRuns(runs);
    expect(links.get(runs[0])).toMatchObject({ deadhead: true, layover: 10, pullOut: true });
    expect(links.get(runs[1])).toMatchObject({ deadhead: false, layover: 5, pullOut: false });
    expect(links.get(runs[2])).toMatchObject({ next: null, layover: null });
  });

  it('treats a terminal across the street (within 250 m) as the same place', () => {
    const near: Places = { coords: new Map([['B', { lat: 43, lon: -79 }], ['B2', { lat: 43.001, lon: -79 }]]) };
    const runs: TripRun[] = [
      { tripId: '1', routeId: 'R', directionId: '0', blockId: 'K', firstStop: 'A', lastStop: 'B', start: 600, end: 630 },
      { tripId: '2', routeId: 'R', directionId: '1', blockId: 'K', firstStop: 'B2', lastStop: 'A', start: 640, end: 670 },
    ];
    expect(linkRuns(runs, near).get(runs[0])!.deadhead).toBe(false);
  });

  it('leaves a gap over an hour out of layover', () => {
    const runs: TripRun[] = [
      { tripId: '1', routeId: 'R', directionId: '0', blockId: 'K', firstStop: 'A', lastStop: 'B', start: 600, end: 630 },
      { tripId: '2', routeId: 'R', directionId: '1', blockId: 'K', firstStop: 'B', lastStop: 'A', start: 720, end: 750 },
    ];
    expect(linkRuns(runs).get(runs[0])).toMatchObject({ layover: null, longGap: true });
  });
});

describe('branches', () => {
  const result = periodPatterns(branchRuns, MIDDAY, branchPlaces);
  const byFirst = (s: string) => result.patterns.find(p => p.legs.some(l => l.lastStop === s))!;

  it('finds two branches sharing a trunk, each with its own cycle and scheduled buses', () => {
    const b = byFirst('B3');
    const c = byFirst('C3');
    expect([b.role, c.role]).toEqual(['branch', 'branch']);
    expect(cycleMin(b, { kind: 'schedule' })).toBe(60);
    expect(cycleMin(c, { kind: 'schedule' })).toBe(40);
    expect(b.scheduledVehicles).toBe(3);
    expect(c.scheduledVehicles).toBe(1);
    expect(result.trunks).toHaveLength(1);
    expect(result.trunks[0].stopIds).toEqual(TRUNK);
  });

  it('target on the shared middle splits buses by each branch\'s current share of trips by default', () => {
    const t = targetVehicles(result.patterns, result.trunks, target({}));
    const b = t.find(x => x.id === byFirst('B3').id)!;
    const c = t.find(x => x.id === byFirst('C3').id)!;
    // B has 2/3 of trunk trips: every 15 on a 60 cycle = 4; C every 30 on a 40 cycle = 2.
    expect([b.headwayMin, b.vehicles]).toEqual([15, 4]);
    expect([c.headwayMin, c.vehicles]).toEqual([30, 2]);
    expect(b.basis).toContain('shared middle');
  });

  it('an even split gives each branch the same headway', () => {
    const t = targetVehicles(result.patterns, result.trunks, target({ branchSplit: 'even' }));
    expect(t.map(x => x.headwayMin)).toEqual([20, 20]);
  });

  it('target on each branch runs every branch at the target', () => {
    const t = targetVehicles(result.patterns, result.trunks, target({ appliesTo: 'branch' }));
    const b = t.find(x => x.id === byFirst('B3').id)!;
    const c = t.find(x => x.id === byFirst('C3').id)!;
    expect([b.vehicles, c.vehicles]).toEqual([6, 4]);
    expect(b.basis).toBe('target on each branch');
  });
});

describe('short turns', () => {
  const FULL = ['A', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'Z'];
  const SHORT = FULL.slice(0, 5);
  const runs = [...pattern('R', FULL, 4, 20, 30, 10, 'f'), ...pattern('R', SHORT, 2, 20, 15, 5, 's')];
  const result = periodPatterns(runs, MIDDAY, places(FULL));
  const full = result.patterns.find(p => p.legs[0].stopIds.length === 8)!;
  const short = result.patterns.find(p => p.legs[0].stopIds.length === 5)!;

  it('counts a short turn on its own shorter round trip', () => {
    expect(short.role).toBe('short turn');
    expect(short.relatedTo).toEqual([full.id]);
    expect(cycleMin(short, { kind: 'schedule' })).toBe(40);
    expect(cycleMin(full, { kind: 'schedule' })).toBe(80);
  });

  it('sets full-route and short-turn headways separately', () => {
    const kept = targetVehicles(result.patterns, result.trunks, target({ headwayMin: 10 }));
    expect(kept.find(x => x.id === full.id)!.vehicles).toBe(8);
    expect(kept.find(x => x.id === short.id)).toMatchObject({ headwayMin: 20, vehicles: 2, basis: 'short turn kept at current headway' });
    const set = targetVehicles(result.patterns, result.trunks, target({ headwayMin: 10, shortTurnHeadwayMin: 10 }));
    expect(set.find(x => x.id === short.id)!.vehicles).toBe(4);
  });

  it('isInside needs the whole shorter sequence in order', () => {
    expect(isInside(['B', 'C', 'D'], ['A', 'B', 'C', 'D', 'E'])).toBe(true);
    expect(isInside(['D', 'C', 'B'], ['A', 'B', 'C', 'D', 'E'])).toBe(false);
    expect(isInside(['B', 'X', 'Y', 'Z'], ['A', 'B', 'C', 'D', 'E'])).toBe(false);
  });
});

describe('interlined routes', () => {
  // Each block runs route 1 out and back (20 + 5 each way), then route 2 out and back (15 + 5), and repeats: 90 min.
  const runs: TripRun[] = [];
  for (let b = 0; b < 3; b++) {
    for (let t = 8 * 60 + b * 30, n = 0; t < 16 * 60; t += 90) {
      const leg = (route: string, dir: string, from: string, to: string, s: number, run: number) =>
        runs.push({ tripId: `${b}-${n++}`, routeId: route, directionId: dir, blockId: `K${b}`, firstStop: from, lastStop: to, start: s, end: s + run });
      leg('1', '0', 'H', 'P', t, 20);
      leg('1', '1', 'P', 'H', t + 25, 20);
      leg('2', '0', 'H', 'Q', t + 50, 15);
      leg('2', '1', 'Q', 'H', t + 70, 15);
    }
  }
  const result = periodPatterns(runs, MIDDAY);

  it('follows blocks across routes and reports the group with its combined cycle', () => {
    expect(result.interlines).toHaveLength(1);
    const [g] = result.interlines;
    expect(g.routeIds).toEqual(['1', '2']);
    expect(g.combinedCycleMin).toBe(90);
    expect(g.scheduledVehicles).toBe(3);
  });

  it('keeps the layover before a route switch in each route\'s cycle (no undercount)', () => {
    const r1 = result.patterns.find(p => p.routeId === '1')!;
    const r2 = result.patterns.find(p => p.routeId === '2')!;
    expect(cycleMin(r1, { kind: 'schedule' }) + cycleMin(r2, { kind: 'schedule' })).toBe(90);
    expect(r1.interlinedWith).toEqual(['2']);
  });
});
