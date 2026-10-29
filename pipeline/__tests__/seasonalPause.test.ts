import { describe, expect, it } from 'vitest';
import { evaluateAgency, type ArtifactSummary, type GateFlag } from '../releaseDiff.js';
import { laterServiceByRoute } from '../seasonalPause.js';

// CIV-1076: Telluride's Goose runs Oct 20 - Nov 22 off season, the gondola Oct 26 - Nov 19. The read
// week (Oct 26 - Nov 1) has neither, yet both have trips later in the same current feed.
const TODAY = '20261027';
const WEEK = ['20261026', '20261027', '20261028', '20261029', '20261030', '20261031', '20261101'];
const row = (service_id: string, start_date: string, end_date: string) => ({
  service_id, monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date, end_date,
});

describe('laterServiceByRoute (CIV-1076)', () => {
  const calendar = [row('winter', '20261122', '20270405'), row('gondola-winter', '20261120', '20270405'), row('year', '20260101', '20271231')];
  const trips = [
    { route_id: 'goose', service_id: 'winter' },
    { route_id: 'gondola', service_id: 'gondola-winter' },
    { route_id: 'town', service_id: 'year' },
    { route_id: 'retired', service_id: 'summer-2026' },
  ];

  it('lists each route with no service in the read week and the first date it runs again', () => {
    expect(laterServiceByRoute({ calendar, calendarDates: [], trips, weekDates: WEEK })).toEqual({ goose: '20261122', gondola: '20261120' });
  });

  it('counts a calendar_dates-only restart, and skips a removed date', () => {
    const calendarDates = [
      { service_id: 'special', date: '20261105', exception_type: '1' },
      { service_id: 'winter', date: '20261122', exception_type: '2' },
    ];
    const out = laterServiceByRoute({ calendar, calendarDates, trips: [...trips, { route_id: 'event', service_id: 'special' }], weekDates: WEEK });
    expect(out).toEqual({ goose: '20261123', gondola: '20261120', event: '20261105' });
  });

  it('leaves out a route whose restart falls past the lookahead', () => {
    expect(laterServiceByRoute({ calendar, calendarDates: [], trips, weekDates: WEEK, horizonDays: 20 })).toEqual({ gondola: '20261120' });
  });
});

const sig = (routeId: string, n: number) => `${routeId}|-107.8${n},37.9${n}|-107.8${n + 1},37.9${n + 1}`;
function summary(routes: string[], modes: string[], resumingRoutes?: Record<string, string>): ArtifactSummary {
  return {
    counts: { stops: routes.length * 20, stopPoints: routes.length * 20, routes: routes.length },
    modes, contentHash: `h-${routes.join(',')}`, routeSignatures: routes.map((r, i) => sig(r, i)).sort(),
    ...(resumingRoutes ? { resumingRoutes } : {}),
    weekdayHeadways: {}, weekdayTiers: {}, weekdayDirectionHeadway: {}, centroid: null,
  };
}
const names = (flags: GateFlag[]) => flags.map(f => `${f.flag}:${f.level}`).sort();
const CURRENT = { start: '20261001', end: '20270405', calendarEnd: '20270405', liveFeedExpiry: '20270405' };

describe('release diff gate: seasonal pause (CIV-1076)', () => {
  const live = summary(['town', 'goose', 'gondola', 'galloping'], ['Aerial Lift', 'Bus']);

  it('passes a sharp drop and a lost mode when every missing route runs again later in a current feed', () => {
    const next = summary(['town'], ['Bus'], { goose: '20261122', gondola: '20261120', galloping: '20261122' });
    const flags = evaluateAgency({ slug: 'telluride', live, next, service: CURRENT, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['drop:yellow', 'mode-lost:yellow']);
    expect(flags[0].message).toMatch(/seasonal pause: 3 routes run again later in this feed, first on 20261120/);
  });

  it('passes an empty output when the whole agency is paused', () => {
    const next = summary([], [], { town: '20261120', goose: '20261122', gondola: '20261120', galloping: '20261122' });
    const flags = evaluateAgency({ slug: 'telluride', live, next, service: CURRENT, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['drop:yellow', 'empty:yellow']);
  });

  it('blocks an expired feed even when its routes have later dates', () => {
    const next = summary(['town'], ['Bus'], { goose: '20261122', gondola: '20261120', galloping: '20261122' });
    const flags = evaluateAgency({ slug: 'telluride', live, next, service: { ...CURRENT, end: '20261020' }, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['drop:red', 'expired:red', 'mode-lost:red']);
  });

  it('blocks a partial zip: the missing routes never run in the new feed (Miami)', () => {
    const miamiLive = summary(['1', '2', '3', '4', '5', 'metrorail'], ['Bus', 'Subway/Metro']);
    const partial = summary(['1'], ['Bus']);
    expect(names(evaluateAgency({ slug: 'miami-dade-transit', live: miamiLive, next: partial, service: CURRENT, allowMissingLive: true }, [], TODAY)))
      .toEqual(['drop:red', 'mode-lost:red']);
  });

  it('blocks when only some missing routes run again later', () => {
    const next = summary(['town'], ['Bus'], { goose: '20261122' });
    expect(names(evaluateAgency({ slug: 'telluride', live, next, service: CURRENT, allowMissingLive: true }, [], TODAY)))
      .toEqual(['drop:red', 'mode-lost:red']);
  });

  it('blocks a lost mode when no route is missing (a route reclassified)', () => {
    const next = summary(['town', 'goose', 'gondola', 'galloping'], ['Bus'], { other: '20261122' });
    expect(names(evaluateAgency({ slug: 'telluride', live, next, service: CURRENT, allowMissingLive: true }, [], TODAY)))
      .toEqual(['mode-lost:red']);
  });
});
