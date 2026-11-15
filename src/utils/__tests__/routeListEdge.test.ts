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
    // #1510: the time was read on the Bronx end (stretch 0, a tail), so the list says it is for part of the route.
    expect(d.edgeText).toBe(periodEdgeText({ from: 432, every: 9, partOfRoute: true }));
    expect(d.edgeText).toBe('every 9 min from 7:12 AM on part of the route');
    expect(d.edge).toEqual({ from: 432, every: 9, partOfRoute: true });
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

describe('a time read on a tail says it is for part of the route (#1510, CIV-1609)', () => {
  const row = (edge: object, role = 'main') => ({
    routeShortName: '169', routeId: '169', directionId: 0, day: 'Weekday', stretchRole: role,
    directionFilterHeadwayByPeriod: { midday: 69 }, routeFilterHeadwayByPeriod: { midday: 69 },
    headwayByPeriod: { midday: 30 }, stretchPeriodEdge: { midday: edge },
  }) as any;
  it('TTC 169 midday: "until 1:51 PM" read on its 3.9 km tail', async () => {
    const { routeListFilterDisplay } = await import('../effectiveHeadway');
    const d = routeListFilterDisplay([row({ until: 831, every: 30, stretch: 1 })], 'midday');
    expect(d.edgeText).toBe('every 30 min until 1:51 PM on part of the route');
    expect(d.edge).toEqual({ until: 831, every: 30, partOfRoute: true });
  });
  it("legitimate: a time read on the main stretch keeps its plain words (Whitehorse 101's 7:16 AM start)", async () => {
    const { routeListFilterDisplay } = await import('../effectiveHeadway');
    const d = routeListFilterDisplay([row({ from: 436, every: 30, stretch: 'main' })], 'midday');
    expect(d.edgeText).toBe('every 30 min from 7:16 AM');
    expect(d.edge).toEqual({ from: 436, every: 30 });
  });
});
