import { describe, expect, it } from 'vitest';
import { SPARKLINE_HOURS } from '../../../shared/config';
import { hourBarColorHeadway, hourBarEmphasis, hourChartLitPeriod, hourChartMaxFreq, stableBranchColors } from '../hourChartModel';

// CIV-1011 #10: one model for the route card's chart and every chart of its full-day view.
describe('hour chart model', () => {
  it('scale: the busiest hour of every series, never below the route floor', () => {
    expect(hourChartMaxFreq([{ 7: 20, 8: 10 }, { 7: 5 }], SPARKLINE_HOURS)).toBe(1 / 5);
    expect(hourChartMaxFreq([{ 7: 20 }], SPARKLINE_HOURS, 1 / 4)).toBe(1 / 4);
    expect(hourChartMaxFreq([{ 7: 20 }], SPARKLINE_HOURS, undefined)).toBe(1 / 20);
    expect(hourChartMaxFreq([{ 7: null, 8: 0, 9: undefined }], SPARKLINE_HOURS)).toBe(0);
  });

  it('colour reads the longest gap only when it is a real gap for riders (CIV-497)', () => {
    expect(hourBarColorHeadway(20, 40)).toBe(40); // 20 over and 2x
    expect(hourBarColorHeadway(20, 34)).toBe(20); // 14 over
    expect(hourBarColorHeadway(30, 50)).toBe(30); // 20 over but 1.67x
    expect(hourBarColorHeadway(30, null)).toBe(30);
  });

  it('emphasis: full in the selected period or with none selected, the lit band next, else faded', () => {
    expect(hourBarEmphasis(7, null, null)).toBe('active');
    expect(hourBarEmphasis(7, 'amPeak', null)).toBe('active');
    expect(hourBarEmphasis(12, 'amPeak', 'midday')).toBe('lit');
    expect(hourBarEmphasis(12, 'amPeak', null)).toBe('dim');
    expect(hourBarEmphasis(17, 'amPeak', 'midday')).toBe('dim');
  });

  it('lit band: the hovered period, else the selected one when it has bars (CIV-933)', () => {
    expect(hourChartLitPeriod('pmPeak', 'amPeak', { 7: 10 }, SPARKLINE_HOURS)).toBe('pmPeak');
    expect(hourChartLitPeriod(null, 'amPeak', { 7: 10 }, SPARKLINE_HOURS)).toBe('amPeak');
    expect(hourChartLitPeriod(null, 'midday', { 7: 10 }, SPARKLINE_HOURS)).toBeNull();
    expect(hourChartLitPeriod(null, null, { 7: 10 }, SPARKLINE_HOURS)).toBeNull();
  });
});

describe('stableBranchColors (Compare, CIV-844)', () => {
  const f = (headsign: string, directionId: number, day = 'Weekday'): GeoJSON.Feature => ({ type: 'Feature', geometry: null as never, properties: { routeShortName: '504', headsign, directionId, dayType: day } });
  const features = [f('Roncesvalles and Queen', 1), f('Dundas West', 1), f('Dufferin Gate', 1), f('Dundas West', 1, 'Saturday'), f('Dufferin Gate', 1, 'Saturday'), f('Broadview', 0)];
  it('gives a destination the same colour whichever day the card shows', () => {
    const colorOf = stableBranchColors(features, '504')!;
    const dundas = colorOf({ headsign: 'Dundas West', directionId: 1 } as never, 0);
    expect(colorOf({ headsign: 'Dundas West', directionId: 1 } as never, 1)).toBe(dundas);
    expect(colorOf({ headsign: 'Dufferin Gate', directionId: 1 } as never, 0)).not.toBe(dundas);
    expect(colorOf({ headsign: 'Roncesvalles and Queen', directionId: 1 } as never, 0)).not.toBe(dundas);
  });
  it('orders each direction on its own and leaves unknown names to the stack', () => {
    const colorOf = stableBranchColors(features, '504')!;
    expect(colorOf({ headsign: 'Broadview', directionId: 0 } as never, 3)).toBe(colorOf({ headsign: 'Dufferin Gate', directionId: 1 } as never, 0));
    expect(colorOf({ headsign: 'Nowhere', directionId: 1 } as never, 0)).toBeUndefined();
    expect(stableBranchColors(undefined, '504')).toBeUndefined();
  });
});
