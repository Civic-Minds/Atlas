import { describe, expect, it } from 'vitest';
import { normalizeStGeorgeLabels } from '../st-george-labels.js';
import type { GtfsData } from '../../../types/gtfs.js';

// Shapes of the City of St. George feed (GTFS_2025-10-13): every route is "Route" with the
// number in the long name; loops end at a "Transfer Announcement" stop beside their terminal.
const route = (route_id: string, route_short_name: string, route_long_name: string) => ({ route_id, route_short_name, route_long_name, route_type: '3' });
const stop = (stop_id: string, stop_name: string, stop_lat: string, stop_lon: string) => ({ stop_id, stop_name, stop_lat, stop_lon });
const times = (trip_id: string, stops: string[]) =>
  stops.map((stop_id, i) => ({ trip_id, stop_id, stop_sequence: String(i + 1), arrival_time: `06:${String(i).padStart(2, '0')}:00`, departure_time: `06:${String(i).padStart(2, '0')}:00` }));
const feed = (routes: ReturnType<typeof route>[], stops: ReturnType<typeof stop>[], stopTimes: ReturnType<typeof times>): GtfsData => ({
  agencies: [], routes, stops, trips: [], calendar: [], calendarDates: [], shapes: [], stopTimes,
} as unknown as GtfsData);

const SUNSET_CORNER = stop('58', 'Sunset Corner 1091 North Bluff Street', '37.127877', '-113.603522');
const ANNOUNCE_SC = stop('139', 'Transfer Announcement', '37.128802', '-113.603435');
const TRANSIT_CENTER = stop('1', 'Transit Center 957 East 100 South', '37.106433', '-113.562691');
const ANNOUNCE_TC = stop('140', 'Transfer Announcement', '37.104545', '-113.562154');
const DESERET = stop('13', 'Deseret Industries 865 North 2450 East (Route 1 Transfer to Route 7)', '37.123175', '-113.531887');
const MID = stop('72', 'Lin\'s Market place 1930 W Sunset Blvd', '37.12', '-113.62');

describe('St. George labels (CIV-1334)', () => {
  it('takes the short name from the long name\'s number and drops "Route " from a long name', () => {
    const { gtfs, renamedRoutes } = normalizeStGeorgeLabels(feed([
      route('5', 'Route', '5 Ivins'),
      route('9', 'Route', '3 West Side Connector'),
      route('Zion', 'Zion', 'Route Zion Route'),
      route('X', '8', 'Downtown'),
    ], [], []));
    expect(gtfs.routes.map(r => [r.route_short_name, r.route_long_name])).toEqual([
      ['5', 'Ivins'], ['3', 'West Side Connector'], ['Zion', 'Zion Route'], ['8', 'Downtown'],
    ]);
    expect(renamedRoutes).toBe(3);
  });

  it('drops only a trailing transfer note from stop names; addresses and other notes stay', () => {
    const { gtfs, renamedStops } = normalizeStGeorgeLabels(feed([], [
      DESERET,
      stop('198', '1670 S 120 E (Dixie Center) St. George', '37.08', '-113.58'),
      stop('12', '1910 East Red Cliffs Dr (Wells Fargo)', '37.11', '-113.55'),
    ], []));
    expect(gtfs.stops.map(s => s.stop_name)).toEqual([
      'Deseret Industries 865 North 2450 East',
      '1670 S 120 E (Dixie Center) St. George',
      '1910 East Red Cliffs Dr (Wells Fargo)',
    ]);
    expect(renamedStops).toBe(1);
  });

  it('reads each "Transfer Announcement" stop as the nearest terminal, so loops end where they start', () => {
    const { gtfs, mappedStops, unmappedStops } = normalizeStGeorgeLabels(feed([], [SUNSET_CORNER, ANNOUNCE_SC, TRANSIT_CENTER, ANNOUNCE_TC, MID], [
      ...times('r5', ['58', '72', '139']),
      ...times('r2', ['1', '72', '140']),
    ]));
    expect(mappedStops).toEqual({ '139': '58', '140': '1' });
    expect(unmappedStops).toEqual([]);
    expect(gtfs.stopTimes.filter(st => st.trip_id === 'r5').map(st => st.stop_id)).toEqual(['58', '72', '58']);
    expect(gtfs.stopTimes.filter(st => st.trip_id === 'r2').map(st => st.stop_id)).toEqual(['1', '72', '1']);
    expect(gtfs.stops.map(s => s.stop_id)).toEqual(['58', '1', '72']);
  });

  it('leaves a "Transfer Announcement" stop far from every terminal as published', () => {
    const far = stop('141', 'Transfer Announcement', '37.20', '-113.40');
    const { gtfs, mappedStops, unmappedStops } = normalizeStGeorgeLabels(feed([], [SUNSET_CORNER, far, MID], times('r', ['58', '72', '141'])));
    expect(mappedStops).toEqual({});
    expect(unmappedStops).toEqual(['141']);
    expect(gtfs.stopTimes.map(st => st.stop_id)).toEqual(['58', '72', '141']);
  });
});
