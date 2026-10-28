import { describe, expect, it } from 'vitest';
import { noTripsInPeriodText } from '../noticeCopy';
import { PERIOD_KEYS } from '../../../shared/config';
import { ROUTE_TYPE, VIRTUAL_LRT_MODE, PEOPLE_MOVER_MODE, ON_DEMAND_MODE } from '../../../shared/rules/modes';

// N127, Ryan's pattern "No {period} {vehicles}" (CIV-471, approved 2026-11-13).
describe('noTripsInPeriodText', () => {
  it('reads the approved words for midday in every mode', () => {
    const word = (mode: number) => noTripsInPeriodText('midday', mode);
    expect(word(ROUTE_TYPE.BUS)).toBe('No midday buses');
    for (const mode of [ROUTE_TYPE.SUBWAY, ROUTE_TYPE.RAIL, VIRTUAL_LRT_MODE]) expect(word(mode)).toBe('No midday trains');
    expect(word(ROUTE_TYPE.FERRY)).toBe('No midday ferries');
    expect(word(ROUTE_TYPE.TRAM)).toBe('No midday streetcars');
    expect(word(ROUTE_TYPE.TROLLEYBUS)).toBe('No midday trolleybuses');
    expect(word(ROUTE_TYPE.MONORAIL)).toBe('No midday monorail trains');
    expect(word(PEOPLE_MOVER_MODE)).toBe('No midday people movers');
    expect(word(ROUTE_TYPE.CABLE_TRAM)).toBe('No midday cable cars');
    expect(word(ROUTE_TYPE.GONDOLA)).toBe('No midday gondolas');
    expect(word(ROUTE_TYPE.FUNICULAR)).toBe('No midday funiculars');
  });

  it('builds every period from the shared names, AM and PM kept as capitals', () => {
    expect(PERIOD_KEYS.map(p => noTripsInPeriodText(p, ROUTE_TYPE.BUS))).toEqual([
      'No AM peak buses', 'No midday buses', 'No PM peak buses', 'No evening buses', 'No late buses', 'No overnight buses',
    ]);
  });

  it('gives no words for a mode without one, no mode, or a period that is not a time of day', () => {
    expect(noTripsInPeriodText('midday', ON_DEMAND_MODE)).toBeNull();
    expect(noTripsInPeriodText('midday', null)).toBeNull();
    expect(noTripsInPeriodText('midday', 99)).toBeNull();
    expect(noTripsInPeriodText('all', ROUTE_TYPE.BUS)).toBeNull();
  });
});
