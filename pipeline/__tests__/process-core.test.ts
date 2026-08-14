import { describe, expect, it } from 'vitest';
import {
  normalizeNrtAnalysisResult,
  selectMetricStopMap,
  selectTerminalDepartureTimes,
  shapeMetricGroupKey,
} from '../process-core';

describe('normalizeNrtAnalysisResult', () => {
  const result = {
    route: 'night-route',
    day: 'Weekday',
    dir: '0',
    avgHeadway: 30,
    medianHeadway: 30,
    tier: 'span',
    tripCount: 8,
    gaps: [30, 30, 30],
    times: [1080, 1110, 1140, 1170],
    reliabilityScore: 100,
    consistencyScore: 100,
    bunchingPenalty: 0,
    outlierPenalty: 0,
    headwayVariance: 0,
    bunchingFactor: 0,
  };

  it('promotes scheduled evening service using its actual median headway', () => {
    expect(normalizeNrtAnalysisResult(result)).toMatchObject({ tier: '30' });
  });

  it('leaves non-span results unchanged', () => {
    const regular = { ...result, tier: '60' };
    expect(normalizeNrtAnalysisResult(regular)).toBe(regular);
  });
});

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
