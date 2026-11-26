import { describe, expect, it } from 'vitest';
import { serviceSpan, type RouteRows } from '../mcp/atlasData';

// #1867: route_frequency's first and last trips. A route that runs through the night has neither; its first and last
// counted hours are only the edges of Atlas's day window (5 AM to 5 AM).
const hours = (from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), 2]));
const route = (row: Record<string, unknown>): RouteRows =>
  ({ key: 'r', name: 'R', shortName: 'R', longName: null, mode: 'bus', rows: [row] }) as unknown as RouteRows;

describe('serviceSpan', () => {
  it('gives no first or last for a route that runs all night (RTC Red Line: every 30 min from 2 AM read "first during the 5 AM hour")', () => {
    const span = serviceSpan(route({
      departuresByHour: hours(5, 27), departureSpan: { last: 27 * 60 + 30 },
      routeRunsByPeriod: { amPeak: true, overnight: true },
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
