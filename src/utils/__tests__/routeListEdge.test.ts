import { describe, expect, it } from 'vitest';
import { periodEdgeText, routeListDisplay } from '../effectiveHeadway';
import { routeCardRange } from '../routeListRange';

// #1292: NYC B AM peak toward Bedford Park: the filter value is 72 (the Bronx end starts at 7:12), the card reads
// "every 9 min from 7:12 AM"; lists and agency pages now read the card's words, the filter value stays 72.
const dir = (directionId: number, value: number | null, edge?: object) => ({
  routeShortName: 'B', routeId: 'B', directionId, day: 'Weekday', stretchRole: 'main',
  directionFilterHeadwayByPeriod: { amPeak: value }, routeFilterHeadwayByPeriod: { amPeak: 72 },
  headwayByPeriod: { amPeak: 9 }, ...(edge ? { stretchPeriodEdge: { amPeak: edge } } : {}),
}) as any;

describe('route lists read the edge that sets the value (#1292)', () => {
  it('NYC B: "every 72" becomes the card\'s "every 9 min from 7:12 AM", its dot coloured for 72 as the card\'s is (CIV-1447)', () => {
    const d = routeListDisplay([dir(0, 72, { from: 432, every: 9, stretch: 0 }), dir(1, 10)], 'amPeak');
    expect(d.headway).toBe(9);
    expect(d.colorHeadway).toBe(72);
    expect(d.edgeText).toBe(periodEdgeText({ from: 432, every: 9 }));
    expect(d.edgeText).toMatch(/9 min from 7:12/);
    expect(d.edge).toEqual({ from: 432, every: 9 });
  });
  it('legitimate: no edge on the direction that sets the value, no edge text', () => {
    expect(routeListDisplay([dir(0, 72), dir(1, 10, { from: 400, every: 8 })], 'amPeak').edgeText).toBeUndefined();
  });
  it('two directions setting the value with different edges: the list reads what the card reads (CIV-1300: the card\'s own words)', () => {
    const ds = [dir(0, 72, { from: 432, every: 9 }), dir(1, 72, { until: 500, every: 10 })];
    expect(routeCardRange(ds, 'amPeak')?.words).toBe('every 9 min from 7:12 AM');
    expect(routeListDisplay(ds, 'amPeak').edgeText).toBe('every 9 min from 7:12 AM');
  });
});
