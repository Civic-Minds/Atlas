import { describe, expect, it } from 'vitest';
import { allBranchStops, branchStripFromV3, branchesOf, columnsOf, sharedRun } from '../branchStripModel';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import type { RouteStripStop } from '../routeStripModel';

const stop = (stopId: string): RouteStripStop => ({ stopId, name: `Stop ${stopId}`, delayMin: 0, lateShare: 0, bunchingShare: null, n: 100 });
const pat = (ids: string[]) => ({ stops: ids.map(stopId => ({ stopId, name: `Stop ${stopId}` })) });
const idsOf = (l: RouteStripStop[]) => l.map(s => s.stopId).join('');

describe('sharedRun', () => {
  it('finds the longest unbroken run every pattern shares', () => {
    expect(sharedRun([...'ABCDEFG'], [[...'ABCDEFG'], [...'XYCDEFZ']])).toEqual({ from: 2, to: 5 });
  });
  it('splits a run that one pattern breaks', () => {
    expect(sharedRun([...'ABCDE'], [[...'ABCDE'], [...'ABQCDE']])).toEqual({ from: 2, to: 4 });
  });
  it('is null when nothing is shared', () => {
    expect(sharedRun([...'ABC'], [[...'ABC'], [...'XYZ']])).toBeNull();
  });
});

describe('branchesOf', () => {
  it('forks at both ends when two services share a trunk (504)', () => {
    // A runs a-b, trunk, then y-z; B runs c-d-e, trunk, then w.
    const m = branchesOf([pat([...'abTRUNKyz'.replace('TRUNK', '12345')]), pat([...'cde12345w'])], s => stop(s.stopId))!;
    expect(idsOf(m.trunk)).toBe('12345');
    expect(m.starts.map(idsOf)).toEqual(['ab', 'cde']);
    expect(m.ends.map(idsOf)).toEqual(['yz', 'w']);
    expect(m.endLabels.map(e => `${e.side}:${e.stop.stopId}:${e.row}`).sort()).toEqual(['end:w:1', 'end:z:0', 'start:a:0', 'start:c:1']);
  });
  it('names the trunk end where a short pattern stops (510)', () => {
    const m = branchesOf([pat([...'12345UV']), pat([...'12345'])], s => stop(s.stopId))!;
    expect(m.starts).toEqual([]);
    expect(m.ends.map(idsOf)).toEqual(['UV']);
    expect(m.endLabels.map(e => `${e.side}:${e.stop.stopId}:${e.row}`).sort()).toEqual(['end:5:0', 'end:V:0', 'start:1:0']);
  });
  it('has no branches for one pattern or identical patterns', () => {
    expect(branchesOf([pat([...'123'])], s => stop(s.stopId))).toBeNull();
    expect(branchesOf([pat([...'123']), pat([...'123'])], s => stop(s.stopId))).toBeNull();
  });
});

describe('columnsOf', () => {
  it('gives every stop one column, shared stops in the same column on every line', () => {
    const m = branchesOf([pat([...'ab12345yz']), pat([...'cde12345w'])], s => stop(s.stopId))!;
    expect(m.lines.map(idsOf)).toEqual(['ab12345yz', 'cde12345w']);
    const cols = columnsOf(m.lines);
    expect(cols.length).toBe(new Set(cols).size);
    expect(cols.filter(c => '12345'.includes(c)).join('')).toBe('12345');
    // each line keeps its own stops in route order
    m.lines.forEach(l => expect(l.map(s => cols.indexOf(s.stopId))).toEqual([...l.map(s => cols.indexOf(s.stopId))].sort((a, b) => a - b)));
  });
});

describe('branchStripFromV3 bunching join (CIV-311)', () => {
  const st = (stopId: string, order: number) => ({ stopId, name: `Stop ${stopId}`, directionId: 0, order, n: 100, medianMin: 1, lateShare: 0.1, timepoint: false });
  const bs = (stopId: string, n: number, bunched: number, gapped: number) => ({ stopId, name: stopId, n, bunchedShare: bunched, gappedShare: gapped, badShare: bunched + gapped, medianGapSec: 300 });
  const v3 = {
    directionLabels: { '0': 'Eastbound' },
    stops: [st('a', 0), st('b', 1), st('c', 2), st('x', -1), st('y', -1), st('z', -1)], buildup: [],
    patterns: { '0': [{ main: true, trips: 10, stops: pat([...'abc']).stops }, { main: false, trips: 6, stops: pat([...'abxyz']).stops }] },
    bunching: [{ directionId: 0, bands: { all: {
      stops: ['a', 'b', 'c'].map((id, i) => ({ ...bs(id, 80, 0.1, 0.1), order: i })),
      branchStops: [bs('x', 80, 0.1, 0.25), bs('y', 12, 0.5, 0)],
    } } }],
  } as unknown as LiveV3;
  it('reads branch-only stops from branchStops and leaves unmeasured ones unmeasured', () => {
    const m = branchStripFromV3(v3, 0, 'all')!;
    const by = new Map(allBranchStops(m).map(s => [s.stopId, s]));
    expect(by.get('x')).toMatchObject({ bunchingShare: 0.35, bunchedShare: 0.1, gappedShare: 0.25, bunchingN: 80 });
    expect(by.get('y')).toMatchObject({ bunchingN: 12 });
    expect(by.get('z')).toMatchObject({ bunchingShare: null, bunchingN: 0 });
    expect(by.get('a')).toMatchObject({ bunchingShare: 0.2, bunchingN: 80 });
  });
  it('still works on a file without branchStops', () => {
    const old = JSON.parse(JSON.stringify(v3)); delete old.bunching[0].bands.all.branchStops;
    const by = new Map(allBranchStops(branchStripFromV3(old, 0, 'all')!).map(s => [s.stopId, s]));
    expect(by.get('x')).toMatchObject({ bunchingShare: null, bunchingN: 0 });
  });
});
