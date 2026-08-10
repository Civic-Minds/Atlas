import { describe, expect, it } from 'vitest';
import { selectMetricStopMap, selectTerminalDepartureTimes, shapeMetricGroupKey } from '../process-core';

describe('selectTerminalDepartureTimes', () => {
  it('prefers the feature shape when a headsign combines multiple schedule patterns', () => {
    const shapeTimes = [600, 630, 660];
    const headsignTimes = [600, 604, 630, 634, 660];

    expect(selectTerminalDepartureTimes(shapeTimes, headsignTimes)).toBe(shapeTimes);
  });

  it('uses headsign departures when no shape-specific departures exist', () => {
    const headsignTimes = [600, 630, 660];

    expect(selectTerminalDepartureTimes(undefined, headsignTimes)).toBe(headsignTimes);
  });
});

describe('shape-scoped metric groups', () => {
  it('keeps route, direction, day, shape, and headsign patterns distinct', () => {
    expect(shapeMetricGroupKey('87', '1', 'Saturday', 'shared', 'Broadview'))
      .not.toBe(shapeMetricGroupKey('87', '1', 'Saturday', 'shared', 'Broadview via East York Acres'));
    expect(shapeMetricGroupKey('G', '0', 'Sunday', 'shared', 'Court Sq'))
      .not.toBe(shapeMetricGroupKey('F', '0', 'Sunday', 'shared', 'Court Sq'));
  });

  it('does not fall back to an unscoped shape map for a headsign feature', () => {
    const specific = new Map([['terminal', 1]]);
    const headsign = new Map([['terminal', 2]]);
    const broadShape = new Map([['terminal', 3]]);
    const route = new Map([['terminal', 4]]);

    expect(selectMetricStopMap('Broadview', specific, headsign, broadShape, route)).toBe(specific);
    expect(selectMetricStopMap('Broadview', undefined, headsign, broadShape, route)).toBe(headsign);
    expect(selectMetricStopMap(null, undefined, undefined, broadShape, route)).toBe(broadShape);
  });
});
