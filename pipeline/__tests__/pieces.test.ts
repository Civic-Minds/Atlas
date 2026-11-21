import { describe, expect, it } from 'vitest';
import { PIECE_PARAMS, directionPieces, patternPools, poolAt, trunkLongEnough } from '../pieces';
import { computeStopSharers } from '../stopPools';
import type { SharedStretchPattern } from '../sharedStretch';
import type { DirectionStretches, Stretch } from '../tripSets';

// CIV-1959 commit 1: a pure refactor. The wrapper answers exactly what the existing logic answered.

const seq = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `s${from + i}`);
const stopsById = new Map(seq(0, 30).map((id, i) => [id, { lat: 43.6 + i * 0.003, lon: -79.4 }] as const));
const pattern = (memberKey: string, headsigns: string[], stopOrder: string[]): SharedStretchPattern => ({ memberKey, routeId: 'r', headsigns, stopOrder });
const stretch = (kind: Stretch['kind'], stops: string[], lengthKm: number): Stretch =>
  ({ kind, stops, refStop: stops[0], lengthKm, times: [], nightTimes: [], tripCount: 10 });

describe('pieces', () => {
  it('keeps the minimums at 5 stops and 1 km', () => {
    expect(PIECE_PARAMS.minStops).toBe(5);
    expect(PIECE_PARAMS.minKm).toBe(1);
    expect(PIECE_PARAMS.convergingMinSharedStops).toBe(5);
  });

  it('patternPools is computeStopSharers, and pools stay asymmetric', () => {
    const a = pattern('A', ['Downtown'], seq(0, 2));
    const b = pattern('B', ['Downtown'], [...seq(0, 2), 's3']);
    const pools = patternPools([a, b], stopsById, new Map());
    expect(pools).toEqual(computeStopSharers([a, b], stopsById, new Map()));
    expect([...poolAt(pools, 'B', 's1')]).toEqual(['A']);
    expect(poolAt(pools, 'B', 's3').size).toBe(0);
    expect(poolAt(pools, 'A', 's3').size).toBe(0);
  });

  it('trunkLongEnough needs both 5 stops and 1 km', () => {
    expect(trunkLongEnough({ stops: seq(0, 4), lengthKm: 1 })).toBe(true);
    expect(trunkLongEnough({ stops: seq(0, 3), lengthKm: 5 })).toBe(false);
    expect(trunkLongEnough({ stops: seq(0, 9), lengthKm: 0.9 })).toBe(false);
  });

  it('directionPieces lists the trunk first, then each branch', () => {
    const d = { main: stretch('main', seq(0, 6), 2), tails: [stretch('tail', seq(7, 12), 2), stretch('tail', seq(13, 18), 2)] } as Pick<DirectionStretches, 'main' | 'tails'>;
    expect(directionPieces(d).map(p => [p.kind, p.stops[0]])).toEqual([['trunk', 's0'], ['branch', 's7'], ['branch', 's13']]);
    expect(directionPieces({ main: null, tails: [] })).toEqual([]);
  });
});
