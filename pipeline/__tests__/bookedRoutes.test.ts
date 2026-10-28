import { describe, expect, it } from 'vitest';
import { BOOKED_SHARE_MIN, bookedShareByRoute, bookingRequiredRouteIds } from '../bookedRoutes';

// Shapes of real feeds (CIV-1006 sweep): exo LRRS 350 has a walk-on stop at each end of every trip (89% booked), Rio
// Vista 50 is a regular bus with booked side stops (82%), Bay Transit's Rivah Ride is about half request stops (51%).
function feed(routes: Array<{ id: string; short: string; stops: string[] }>) {
  const trips = routes.map(r => ({ trip_id: `t-${r.id}`, route_id: r.id }));
  const stopTimes = routes.flatMap(r => r.stops.map((pickup_type, i) => ({ trip_id: `t-${r.id}`, stop_sequence: String(i), pickup_type })));
  return {
    routes: routes.map(r => ({ route_id: r.id, route_short_name: r.short })),
    trips,
    stopTimes,
  } as never;
}
const stops = (booked: number, walkOn: number) => [...Array(booked).fill('2'), ...Array(walkOn).fill('0')];

describe('routes riders must book ahead (CIV-1006)', () => {
  const gtfs = feed([
    { id: 'exo350', short: '350', stops: stops(8, 1) },     // 89%
    { id: 'rio50', short: '50', stops: stops(41, 9) },      // 82%
    { id: 'rivah', short: 'RR', stops: stops(51, 49) },     // 51%
    { id: 'taxi', short: 'T12', stops: stops(10, 0) },      // 100%
    { id: 'bus', short: '7', stops: stops(0, 20) },         // none
    { id: 'blank', short: '9', stops: ['', '', '2', ' 2'] }, // blank pickup_type is a normal stop
  ]);

  it('reads the booked share of each route\'s stop events', () => {
    const share = bookedShareByRoute(gtfs);
    expect(share.get('exo350')).toBeCloseTo(8 / 9);
    expect(share.get('rio50')).toBeCloseTo(0.82);
    expect(share.has('bus')).toBe(false);
    expect(share.get('blank')).toBe(0.5);
  });

  it(`counts a route as booked at ${BOOKED_SHARE_MIN * 100}% or more, so request stops on a regular bus do not`, () => {
    expect([...bookingRequiredRouteIds(gtfs)].sort()).toEqual(['exo350', 'taxi']);
  });

  it('lets the agency force a route either way by short name', () => {
    expect([...bookingRequiredRouteIds(gtfs, { 50: true, T12: false })].sort()).toEqual(['exo350', 'rio50']);
  });
});
