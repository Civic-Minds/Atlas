import { describe, expect, it } from 'vitest';
import { buildPooledStopMap, computeStopSharers } from '../stopPools';
import type { SharedStretchPattern } from '../sharedStretch';

// #690: who pools with whom at each stop, and how a line is cut into segments.

const seq = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `s${from + i}`);
/** Stops ~330 m apart on a straight line; others get explicit coordinates. */
const stopsById = (extra: Record<string, [number, number]> = {}) => new Map<string, { lat: number; lon: number }>(
  [...seq(0, 30).map((id, i) => [id, { lat: 43.6 + i * 0.003, lon: -79.4 }] as const),
    ...Object.entries(extra).map(([id, [lat, lon]]) => [id, { lat, lon }] as const)],
);
const pattern = (memberKey: string, headsigns: string[], stopOrder: string[]): SharedStretchPattern => ({ memberKey, routeId: 'r', headsigns, stopOrder });
const noParents = new Map<string, string>();

describe('computeStopSharers', () => {
  it('two branches share an aligned run of at least 5 stops and 1 km, not a 3-stop overlap', () => {
    const a = pattern('A', ['To A'], [...seq(0, 7), 'a1']);
    const b = pattern('B', ['To B'], [...seq(0, 7), 'b1']);
    const sharers = computeStopSharers([a, b], stopsById({ a1: [43.624, -79.39], b1: [43.624, -79.41] }), noParents);
    for (const stopId of seq(0, 7)) expect([...sharers.get('A')!.get(stopId)!]).toEqual(['B']);
    expect(sharers.get('A')!.has('a1')).toBe(false);
    const short = computeStopSharers([pattern('A', ['To A'], [...seq(0, 2), 'a1']), pattern('B', ['To B'], [...seq(0, 2), 'b1'])],
      stopsById({ a1: [43.609, -79.39], b1: [43.609, -79.41] }), noParents);
    expect(short.get('A')).toBeUndefined();
  });

  it('a same-destination variant pools at every common stop, with no run minimum', () => {
    // RTC 219: shape B is shape A plus one extra stop at the end; Intercity 20: the same stops
    // under another shape id. A 3-stop common run is below the aligned-run minimum.
    const a = pattern('A', ['Downtown'], seq(0, 2));
    const b = pattern('B', ['Downtown'], [...seq(0, 2), 's3']);
    const sharers = computeStopSharers([a, b], stopsById(), noParents);
    for (const stopId of seq(0, 2)) expect([...sharers.get('A')!.get(stopId)!]).toEqual(['B']);
    for (const stopId of seq(0, 2)) expect([...sharers.get('B')!.get(stopId)!]).toEqual(['A']);
    expect(sharers.get('B')!.has('s3')).toBe(false);
  });

  it('a same-headsign short turn under the coverage share is only an aligned run', () => {
    // TTC 94 Castle Frank: trips from Ossington (26 stops) and from Wellesley (the last 11),
    // one headsign. The short turn covers 42% of the long pattern: it pools on its own 11 stops
    // (an aligned run) and nowhere else; the long pattern never pools on the short turn's stops
    // through the waiver, only through the same run.
    const long = pattern('L', ['Castle Frank'], seq(0, 25));
    const short = pattern('S', ['Castle Frank'], seq(15, 25));
    const sharers = computeStopSharers([long, short], stopsById(), noParents);
    for (const stopId of seq(0, 14)) expect(sharers.get('L')!.has(stopId)).toBe(false);
    for (const stopId of seq(15, 25)) expect([...sharers.get('L')!.get(stopId)!]).toEqual(['S']);
    for (const stopId of seq(15, 25)) expect([...sharers.get('S')!.get(stopId)!]).toEqual(['L']);
  });

  it('two patterns that meet at one stop never pool there (Niagara 301/401)', () => {
    const a = pattern('A', ['Hospital'], [...seq(0, 4), 'hub']);
    const b = pattern('B', ['Hospital'], ['hub', ...seq(10, 14)]);
    const sharers = computeStopSharers([a, b], stopsById({ hub: [43.615, -79.42] }), noParents);
    expect(sharers.get('A')).toBeUndefined();
    expect(sharers.get('B')).toBeUndefined();
  });

  it('matches platforms of one station across patterns', () => {
    const parents = new Map([['p1', 's1'], ['p2', 's2'], ['p3', 's3'], ['p4', 's4'], ['p5', 's5']]);
    const a = pattern('A', ['North'], ['s0', 's1', 's2', 's3', 's4', 's5', 'a1']);
    const b = pattern('B', ['North'], ['s0', 'p1', 'p2', 'p3', 'p4', 'p5', 'b1']);
    const sharers = computeStopSharers([a, b], stopsById({ a1: [43.624, -79.39], b1: [43.624, -79.41], p1: [43.603, -79.4], p2: [43.606, -79.4], p3: [43.609, -79.4], p4: [43.612, -79.4], p5: [43.615, -79.4] }), parents);
    for (const stationKey of seq(0, 5)) expect([...sharers.get('A')!.get(stationKey)!]).toEqual(['B']);
  });
});

describe('buildPooledStopMap', () => {
  it('merges the other patterns\' departures at pooled stops and keeps the own list elsewhere', () => {
    const own = new Map([['s0', [600, 630]], ['s1', [601, 631]], ['a1', [605, 635]]]);
    const sharers = new Map([['s0', new Set(['B'])], ['s1', new Set(['B', 'C'])]]);
    const departures = new Map<string, Map<string, number[]>>([
      ['B', new Map([['s0', [615, 645]], ['s1', [616, 646]]])],
      ['C', new Map([['s1', [620]]])],
    ]);
    const { map, pooledStops } = buildPooledStopMap(own, sharers, key => departures.get(key), noParents);
    expect(map.get('s0')).toEqual([600, 615, 630, 645]);
    expect(map.get('s1')).toEqual([601, 616, 620, 631, 646]);
    expect(map.get('a1')).toBe(own.get('a1'));
    expect([...pooledStops]).toEqual(['s0', 's1']);
    // A sharer with no departures at the stop changes nothing.
    const none = buildPooledStopMap(own, new Map([['a1', new Set(['B'])]]), key => departures.get(key), noParents);
    expect(none.map.get('a1')).toEqual([605, 635]);
    expect(none.pooledStops.size).toBe(0);
    // A drop-off-only stop of the own pattern (no pickup-eligible departures) where no other
    // pattern boards keeps its own list; where another pattern boards, it reads that pattern.
    const ownDeps = new Map([['s0', [600, 630]], ['s1', []], ['a1', [605, 635]]]);
    const sharersNone = new Map([['s1', new Set(['C'])]]);
    const kept = buildPooledStopMap(own, sharersNone, key => (key === 'C' ? new Map() : departures.get(key)), noParents, ownDeps);
    expect(kept.map.get('s1')).toBe(own.get('s1'));
    expect(kept.pooledStops.size).toBe(0);
    const read = buildPooledStopMap(own, new Map([['s1', new Set(['B'])]]), key => departures.get(key), noParents, ownDeps);
    expect(read.map.get('s1')).toEqual([616, 646]);
  });
});

