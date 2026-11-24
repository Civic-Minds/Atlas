import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { branchSplitPieces, computeFrequencySegmentOverlay, failingRouteSharedRanges } from '../frequencySegments';
import { headwayToTierColor } from '../colors';
import type { AgencyLayers } from '../../hooks/useAgencyData';

// CIV-1565 (replaces #1093 V0): the colour of a drawn stretch changes only where the route's branches split or a short
// turn ends. Ryan, 2026-11-24: "Just think it would look very odd if we have a single section between 2 stops where the
// colour is different".
const at = (vals: Array<number | null>) => (i: number) => vals[i];
const run = (vals: Array<number | null>, splits: number[] = [], period: any = 'midday', from = 0) =>
  branchSplitPieces(period, from, vals.length - 1, at(vals), new Set(splits));

describe('branchSplitPieces (CIV-1565)', () => {
  it('a slower end stop away from any split colours the whole stretch (no one-segment stub)', () => {
    expect(run([15, 14, 15, 30])).toEqual([{ from: 0, to: 3, headway: 30 }]);
    expect(run([30, 15, 14, 15])).toEqual([{ from: 0, to: 3, headway: 30 }]);
  });

  it('one-minute tier-edge differences keep worst-stop colouring', () => {
    expect(run([15, 15, 15, 16])).toEqual([{ from: 0, to: 3, headway: 16 }]);
  });

  it('the colour changes exactly at a branch split inside the stretch; the joining piece takes the worse side', () => {
    // Trunk 0..3 every 7; the branch past stop 3 every 14 (split after stop 3).
    expect(run([7, 7, 7, 7, 14, 14], [3])).toEqual([
      { from: 0, to: 3, headway: 7 },
      { from: 3, to: 5, headway: 14 },
    ]);
  });

  it('an end stop that is itself a split stop keeps its own piece', () => {
    // Range 0..4 whose last stop is the split stop (split after stop 4).
    expect(run([8, 8, 8, 8, 14], [4])).toEqual([
      { from: 0, to: 3, headway: 8 },
      { from: 3, to: 4, headway: 14 },
    ]);
    // First stop is the merge stop (split after the stop before the range).
    expect(branchSplitPieces('midday', 1, 5, at([null, 14, 8, 8, 8, 8]), new Set([0]))).toEqual([
      { from: 1, to: 2, headway: 14 },
      { from: 2, to: 5, headway: 8 },
    ]);
  });

  it('a split with the same colour on both sides draws one piece', () => {
    expect(run([7, 7, 8, 8], [1])).toEqual([{ from: 0, to: 3, headway: 8 }]);
  });

  it('the all-day value keeps one colour per stretch', () => {
    expect(run([7, 7, 7, 7, 14, 14], [3], 'all')).toEqual([{ from: 0, to: 5, headway: 14 }]);
  });

  it('never shows a piece better than the worse of its own two stops, and colours change only at splits', () => {
    let seed = 1565;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const choices = [5, 8, 10, 12, 15, 16, 20, 24, 30, 45, 60];
    for (let n = 0; n < 4000; n++) {
      const len = 2 + Math.floor(rnd() * 10);
      const vals = Array.from({ length: len }, () => choices[Math.floor(rnd() * choices.length)]);
      const splits = Array.from({ length: len + 1 }, (_, i) => i - 1).filter(() => rnd() < 0.2);
      const pieces = run(vals, splits);
      expect(pieces[0].from).toBe(0);
      expect(pieces.at(-1)!.to).toBe(len - 1);
      for (let k = 1; k < pieces.length; k++) {
        expect(pieces[k].from).toBe(pieces[k - 1].to);
        // A colour change at stop b sits at a split: a split after stop b - 1 or b, or a range end that is a split stop
        // (split after the stop before the range, or after its last stop) one stop away.
        const b = pieces[k].from;
        const atSplit = splits.includes(b - 1) || splits.includes(b)
          || (b === 1 && splits.includes(-1)) || (b === len - 2 && splits.includes(len - 1));
        expect(atSplit).toBe(true);
      }
      for (const piece of pieces) {
        for (let i = piece.from; i < piece.to; i++) {
          expect(piece.headway).toBeGreaterThanOrEqual(Math.max(vals[i], vals[i + 1]));
        }
        expect(piece.headway).toBeLessThanOrEqual(Math.max(...vals));
      }
    }
  });
});

describe('overlay colours (CIV-1565)', () => {
  it('a route with no branches draws a slower end stop in the stretch colour, not as its own piece', () => {
    // s1..s4 qualify at a 20-minute filter (15, 14, 15, 18); s5 (30) fails and breaks the range.
    const stopIds = ['s1', 's2', 's3', 's4', 's5'];
    const heads: Record<string, number> = { s1: 15, s2: 14, s3: 15, s4: 18, s5: 30 };
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: stopIds.map((_, i) => [i * 0.01, 0]) },
      properties: {
        routeId: '900', directionId: 0, headsign: 'X', day: 'Weekday', routeShortName: '900', tier: '20',
        stopOrder: stopIds, stopPositions: stopIds.map((_, i) => i / 4),
        stopPeriodHeadways: Object.fromEntries(stopIds.map(s => [s, { evening: heads[s] }])),
        worstDirectionHeadway: 20, worstDirectionHeadwayByPeriod: { evening: 20 },
      },
    };
    const layers: AgencyLayers = { drt: { type: 'FeatureCollection', features: [feature] } };
    const overlay = computeFrequencySegmentOverlay(layers, 'evening', 20);
    expect(overlay.segments).toHaveLength(1);
    expect(overlay.segments[0].properties.color).toBe(headwayToTierColor(18));
  });

  // Real TTC 123 weekday data (trimmed fixture). Toward Kipling the North Queen and East Mall branches merge at
  // North Queen St at The East Mall (every 7 from there on). The nearest opposite stop is on The East Mall branch
  // (every 14), past the opposite direction's split, which used to colour that merge stop's piece every 14.
  // Read as the public build does (no trunk filter value), where TTC 123 fails every 15 and draws only its shared stretches.
  const ttc123 = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/ttc-123-weekday.json'), 'utf8')) as GeoJSON.FeatureCollection;
  for (const f of ttc123.features) delete (f.properties as any).routeTrunkHeadwayByPeriod;

  it('TTC 123 toward Kipling: the trunk colour runs right up to the merge stop', () => {
    const ranges = failingRouteSharedRanges(ttc123.features, ttc123.features, 'amPeak', 15);
    const nq = ranges.find(r => (r.feature.properties as any).headsign === 'Kipling via North Queen and Shorncliffe')!;
    const order: string[] = (nq.feature.properties as any).stopOrder;
    const merge = order.indexOf('14320');
    const range = nq.ranges.find(([a]) => a === merge)!;
    expect(nq.values.get(merge)).toBe(14); // both directions' worst, as before
    expect(nq.ownValues.get(merge)).toBe(7);
    expect(nq.colourValues.get(merge)).toBe(7);
    expect(branchSplitPieces('amPeak', range[0], range[1], i => nq.colourValues.get(i), nq.splitsAfter))
      .toEqual([{ from: range[0], to: range[1], headway: 7 }]);
  });

  it('TTC 123 from Kipling: the colour changes at the branch split, not before it', () => {
    const ranges = failingRouteSharedRanges(ttc123.features, ttc123.features, 'amPeak', 15);
    const em = ranges.find(r => (r.feature.properties as any).headsign === 'Long Branch via Shorncliffe and East Mall')!;
    const order: string[] = (em.feature.properties as any).stopOrder;
    const split = order.indexOf('9238'); // North Queen St at Medulla Ave, the last stop both branches serve
    const range = em.ranges.find(([a, b]) => a <= split && split < b)!;
    const pieces = branchSplitPieces('amPeak', range[0], range[1], i => em.colourValues.get(i), em.splitsAfter);
    expect(pieces).toEqual([
      { from: range[0], to: split, headway: 7 },
      { from: split, to: range[1], headway: 14 },
    ]);
  });
});
