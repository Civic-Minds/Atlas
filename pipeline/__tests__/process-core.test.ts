import { describe, expect, it } from 'vitest';
import {
  normalizeNrtAnalysisResult,
  hasNightServiceAtShapeEndpoints,
  selectTerminalDepartureTimes,
  selectPeriodCoverageHeadway,
} from '../process-core';

describe('selectPeriodCoverageHeadway', () => {
  it('follows the terminal when the display selects its median', () => {
    expect(selectPeriodCoverageHeadway(120, 10, 10, 10, true)).toBe(120);
  });

  it('follows the protected branch when its median wins', () => {
    expect(selectPeriodCoverageHeadway(10, 120, 10, 30, false)).toBe(120);
  });

  it('does not borrow service when a scoped terminal period is empty', () => {
    expect(selectPeriodCoverageHeadway(null, 10, 10, 10, true)).toBeNull();
    expect(selectPeriodCoverageHeadway(null, 10, null, 10, true)).toBeNull();
  });

  it('keeps coverage when too few terminal departures exist for any median', () => {
    expect(selectPeriodCoverageHeadway(90, null, null, null, true)).toBe(90);
  });

  it('uses the selected branch when a sparse terminal median falls back to it', () => {
    expect(selectPeriodCoverageHeadway(90, 120, null, 30, true)).toBe(120);
  });
});

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

  it('preserves an empty scoped array instead of borrowing another pattern', () => {
    const empty: number[] = [];
    expect(selectTerminalDepartureTimes(empty, [360, 370, 380])).toBe(empty);
  });
});

describe('hasNightServiceAtShapeEndpoints', () => {
  it('qualifies an overnight-only route before daytime stop metrics exist', () => {
    const routeDepartures = new Map([
      ['origin', [47, 107, 167, 227, 287, 347]],
      ['terminal', [120, 180]],
    ]);

    expect(hasNightServiceAtShapeEndpoints(['origin', 'terminal'], routeDepartures)).toBe(true);
  });

  it('combines plain and shifted overnight-only departures at an endpoint', () => {
    const routeDepartures = new Map([['origin', [47, 107, 167]]]);
    const overnightOnly = new Map([['origin', [1620, 1680, 1740]]]);

    expect(hasNightServiceAtShapeEndpoints(['origin'], routeDepartures, overnightOnly)).toBe(true);
  });
});
