import { describe, expect, it } from 'vitest';
import { hasNightServiceAtShapeEndpoints, selectTerminalDepartureTimes } from '../process-core';

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
