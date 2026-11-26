import { describe, expect, it } from 'vitest';
import { allNightService, serviceSpan, type RouteRows } from '../mcp/atlasData';
import { runsEveryHour } from '../../shared/routeRuns';

// #1867: route_frequency's first and last trips. A route that runs through the night has neither; its first and last
// counted hours are only the edges of Atlas's day window (5 AM to 5 AM).
const hours = (from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), 2]));
const route = (row: Record<string, unknown>): RouteRows =>
  ({ key: 'r', name: 'R', shortName: 'R', longName: null, mode: 'bus', rows: [row] }) as unknown as RouteRows;

describe('serviceSpan', () => {
  it('gives no first or last for a route that runs all night (RTC Red Line: every 30 min from 2 AM read "first during the 5 AM hour")', () => {
    const span = serviceSpan(route({
      departuresByHour: hours(5, 27), departureSpan: { last: 27 * 60 + 30 },
      routeRunsByPeriod: { amPeak: true, overnight: true }, nightService30: true,
    }));
    expect(span).toEqual({ first: null, last: null, breaks: [] });
  });

  it('keeps the first and last of a route that stops overnight', () => {
    const span = serviceSpan(route({
      departuresByHour: hours(6, 22), departureSpan: { first: 6 * 60 + 5, last: 22 * 60 + 40 },
      routeRunsByPeriod: { amPeak: true, overnight: false },
    }));
    expect(span?.first).toBe('6:05 AM');
    expect(span?.last).toBe('10:40 PM');
  });

  it('still says the hour when a route that stops overnight has no exact first time', () => {
    const span = serviceSpan(route({ departuresByHour: hours(6, 22), departureSpan: { last: 22 * 60 + 40 }, routeRunsByPeriod: { overnight: false } }));
    expect(span?.first).toBe('during the 6 AM hour');
  });
});

// #1867, Ryan option 1: an all-night route says so, with its Overnight figure, and "24 hours" only where every hour runs both ways.
describe('allNightService', () => {
  const s = { figures: { midday: { shown: 'every 12 min' }, pmPeak: { shown: 'every 12 min' }, evening: { shown: 'every 15 min' }, overnight: { shown: 'every 30 min' } }, span: { first: null, last: null, breaks: [] } } as never;
  it('says it runs all night, and 24 hours 7 days a week when every day runs every hour', () => {
    expect(allNightService(s, ['Weekday', 'Saturday', 'Sunday'])).toEqual({ first: null, last: null, runsAllNight: 'Runs all night: every 30 min overnight (2–6 AM)', runs24Hours: 'Runs 24 hours, 7 days a week', breaks: [] });
  });
  it('names the days when only some run every hour, and says nothing of 24 hours when none do', () => {
    expect(allNightService(s, ['Weekday', 'Saturday']).runs24Hours).toBe('Runs 24 hours on weekdays and Saturdays');
    expect(allNightService(s, [])).not.toHaveProperty('runs24Hours');
  });
});

describe('runsEveryHour', () => {
  const day = (skip?: number) => Object.fromEntries([...Array.from({ length: 24 }, (_, i) => i + 5)].filter(h => h !== skip).map(h => [String(h), 2]));
  it('needs every hour of the day in every direction, by departures or a regular wait', () => {
    expect(runsEveryHour([{ directionId: 0, departuresByHour: day() }, { directionId: 1, departuresByHour: day(27), headwayByHour: { 27: 30 } }])).toBe(true);
    expect(runsEveryHour([{ directionId: 0, departuresByHour: day() }, { directionId: 1, departuresByHour: day(27) }])).toBe(false);
  });
});

// Ryan's words for a night-only route (2026-11-26): only "Runs overnight only", never beside the all-night line.
describe('a night-only route', () => {
  const nightOnly = { figures: { amPeak: { shown: 'some trips (3), but no regular frequency' }, midday: { shown: 'no service' }, pmPeak: { shown: 'no service' }, evening: { shown: 'no service' }, overnight: { shown: 'every 15 min' } }, span: { first: null, last: null, breaks: ['6:18 AM–1:12 AM (after midnight)'] } } as never;
  it('says only "Runs overnight only", with no times or breaks (TTC 320 weekday)', () => {
    expect(allNightService(nightOnly, [])).toEqual({ first: null, last: null, runsOvernightOnly: 'Runs overnight only', breaks: [] });
  });
  it('keeps the all-night line for a route with daytime service (the Red Line runs every 12 at midday)', () => {
    const red = { figures: { midday: { shown: 'every 12 min' }, pmPeak: { shown: 'no service' }, evening: { shown: 'no service' }, overnight: { shown: 'every 30 min' } }, span: null } as never;
    expect(allNightService(red, [])).toHaveProperty('runsAllNight');
  });
});
