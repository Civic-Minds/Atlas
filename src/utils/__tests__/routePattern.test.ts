import { describe, expect, it } from 'vitest';
import { routePatternLabel } from '../routePattern';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const none = { amPeak: null, midday: null, pmPeak: null, evening: null, late: null, overnight: null };
const dir = (over: Partial<ShapeProperties>): ShapeProperties =>
  ({ routeId: 'r', directionId: 0, day: 'Weekday', tier: '30', serviceClass: 'regular', headwayByPeriod: { ...none }, ...over }) as ShapeProperties;

describe('routePatternLabel (#720)', () => {
  it('names nothing for a regular all-day route', () => {
    expect(routePatternLabel([dir({ headwayByPeriod: { ...none, amPeak: 10, midday: 15, pmPeak: 10 } })])).toBeNull();
  });

  it('a time-limited route with service only in the peaks is rush hour only', () => {
    expect(routePatternLabel([
      dir({ serviceClass: 'time-limited', headwayByPeriod: { ...none, amPeak: 8 } }),
      dir({ directionId: 1, serviceClass: 'time-limited', headwayByPeriod: { ...none, pmPeak: 8 } }),
    ])).toBe('Rush hour only');
  });

  it('a steady rush-hour-only route still classed irregular is named by its hours (SF 8BX)', () => {
    // 8BX weekday: 06:32-09:04 inbound, 15:36-18:32 outbound; the 09:04 and 18:32 trips spill into
    // the midday and evening periods, so hours decide, with an hour of slack around each peak.
    expect(routePatternLabel([
      dir({ serviceClass: 'irregular', tier: 'span', headwayByPeriod: { ...none, amPeak: 8, midday: 8 }, headwayByHour: { 6: 8, 7: 8, 8: 8, 9: 8 } }),
      dir({ directionId: 1, serviceClass: 'irregular', tier: 'span', headwayByPeriod: { ...none, pmPeak: 8, evening: 8 }, headwayByHour: { 15: 8, 16: 8, 17: 8, 18: 8, 19: 8 } }),
    ])).toBe('Rush hour only');
  });

  it('a route with midday hours is not rush hour only', () => {
    expect(routePatternLabel([dir({ serviceClass: 'time-limited', headwayByHour: { 7: 20, 12: 30, 17: 20 } })])).toBeNull();
  });

  it('a time-limited route running from the evening on is evenings only', () => {
    expect(routePatternLabel([dir({ serviceClass: 'time-limited', headwayByPeriod: { ...none, evening: 30, late: 30 } })])).toBe('Evenings only');
  });

  it('a route running on some weekdays only is some days only', () => {
    expect(routePatternLabel([dir({ serviceClass: 'time-limited', partialWeekdayServiceByPeriod: { midday: true }, headwayByPeriod: { ...none, midday: 30 } })])).toBe('Some days only');
  });

  it('an irregular route with no period reading is a few trips a day', () => {
    expect(routePatternLabel([dir({ serviceClass: 'irregular', tier: 'span' })])).toBe('A few trips a day');
  });

  it('a limited route with service across the day gets no pattern name', () => {
    expect(routePatternLabel([dir({ serviceClass: 'time-limited', headwayByPeriod: { ...none, amPeak: 20, midday: 60, evening: 30 } })])).toBeNull();
  });
});
