import { describe, it, expect } from 'vitest';
import { stretchPieces, computeFrequencySegmentOverlay } from '../frequencySegments';
import { headwayToTierColor } from '../colors';
import type { AgencyLayers } from '../../hooks/useAgencyData';

// #1093 V0: an end stop a public tier worse than every other stop colours only its own end piece.
const at = (vals: Array<number | null>) => (i: number) => vals[i];
const run = (vals: Array<number | null>, period: any = 'midday') => stretchPieces(period, 0, vals.length - 1, at(vals));

describe('stretchPieces (#1093 V0)', () => {
  it('a worse last stop colours only its own end piece; the rest takes the worst of the others', () => {
    expect(run([15, 14, 15, 30])).toEqual([
      { from: 0, to: 2, headway: 15 },
      { from: 2, to: 3, headway: 30 },
    ]);
  });

  it('a worse first stop colours only its own end piece', () => {
    expect(run([30, 15, 14, 15])).toEqual([
      { from: 0, to: 1, headway: 30 },
      { from: 1, to: 3, headway: 15 },
    ]);
  });

  it('a weak stop in the middle is untouched: one colour at the worst stop', () => {
    expect(run([15, 30, 15, 15])).toEqual([{ from: 0, to: 3, headway: 30 }]);
  });

  it('both ends: only an end strictly worse than every other stop (the other end included) peels', () => {
    // 60 is worse than 30 and the middle: it peels; the 30 end stays with the rest, so the rest reads 30.
    expect(run([60, 15, 15, 30])).toEqual([
      { from: 0, to: 1, headway: 60 },
      { from: 1, to: 3, headway: 30 },
    ]);
    // Two ends in the same tier: neither is worse than every other stop, so nothing is peeled.
    expect(run([30, 15, 15, 30])).toEqual([{ from: 0, to: 3, headway: 30 }]);
  });

  it('only a whole public tier counts: 16 is the next tier after 15, 16 and 20 share one', () => {
    expect(run([14, 15, 16])).toEqual([
      { from: 0, to: 1, headway: 15 },
      { from: 1, to: 2, headway: 16 },
    ]);
    // Same tier (16 vs 20): not worse than every other stop, so one colour.
    expect(run([20, 16, 18])).toEqual([{ from: 0, to: 2, headway: 20 }]);
  });

  it('two-stop and single-stop stretches stay one piece', () => {
    expect(run([15, 30])).toEqual([{ from: 0, to: 1, headway: 30 }]);
    expect(stretchPieces('midday', 0, 0, at([15]))).toEqual([{ from: 0, to: 0, headway: 15 }]);
  });

  it('the all-day value keeps the one-colour rule', () => {
    expect(run([15, 14, 15, 30], 'all')).toEqual([{ from: 0, to: 3, headway: 30 }]);
  });

  it('never shows a piece better than the worse of its own two stops (no overstatement)', () => {
    let seed = 1093;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const choices = [8, 10, 12, 15, 16, 20, 24, 30, 45, 60];
    let peeledRanges = 0;
    for (let n = 0; n < 4000; n++) {
      const len = 2 + Math.floor(rnd() * 8);
      const vals = Array.from({ length: len }, () => choices[Math.floor(rnd() * choices.length)]);
      const pieces = run(vals);
      // Pieces tile the stretch in order, with no gaps.
      expect(pieces[0].from).toBe(0);
      expect(pieces.at(-1)!.to).toBe(len - 1);
      for (let k = 1; k < pieces.length; k++) expect(pieces[k].from).toBe(pieces[k - 1].to);
      const before = Math.max(...vals);
      if (pieces.length > 1) peeledRanges++;
      for (const piece of pieces) {
        for (let i = piece.from; i < piece.to; i++) {
          expect(piece.headway).toBeGreaterThanOrEqual(Math.max(vals[i], vals[i + 1]));
        }
        // Never worse than today's one-colour rule either.
        expect(piece.headway).toBeLessThanOrEqual(before);
      }
    }
    expect(peeledRanges).toBeGreaterThan(0);
  });
});

describe('overlay colours (#1093 V0)', () => {
  it('draws the worse end stop as its own differently coloured piece on a partial range', () => {
    // s1..s4 qualify at a 20-minute filter (15, 14, 15, 18); s5 (30) fails and breaks the range.
    // Stretch s1..s4 is one tier-15/20 mix: here the last stop (18, tier 20) is a tier worse than the rest (tier 15).
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
    const colors = overlay.segments.map(s => s.properties.color);
    expect(overlay.segments).toHaveLength(2);
    expect(colors[0]).toBe(headwayToTierColor(15, 'default' as any));
    expect(colors[1]).toBe(headwayToTierColor(18, 'default' as any));
    expect(colors[0]).not.toBe(colors[1]);
  });
});
