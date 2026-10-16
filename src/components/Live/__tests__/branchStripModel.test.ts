import { describe, expect, it } from 'vitest';
import { branchesOf, sharedRun } from '../branchStripModel';
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
