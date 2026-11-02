import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitRoutes, type RouteSplit } from '../split-routes';

// #1287: Miami-Dade publishes all of Metrorail as route 31009; Orange trips serve the airport, Green trips Palmetto.
const SPLIT: RouteSplit = {
  routeShortName: '2600',
  parts: [
    { shortName: 'Green', longName: 'Palmetto ↔ Dadeland South', color: 'A2CF5F', servesStop: 'PALMETTO' },
    { shortName: 'Orange', longName: 'Miami International Airport ↔ Dadeland South', color: 'F04E23', servesStop: 'MIAMI INTERNATIONAL AIRPORT' },
  ],
};
const stops = [
  { stop_id: 'pal', stop_name: 'PALMETTO STATION RAIL SOUTHBOUND' },
  { stop_id: 'mia', stop_name: 'MIAMI INTERNATIONAL AIRPORT STATION SOUTHBOUND' },
  { stop_id: 'ehs', stop_name: 'EARLINGTON HTS.STAT.RAIL SOUTHBOUND' },
  { stop_id: 'dad', stop_name: 'DADELAND SOUTH STAT.RAIL SOUTHBOUND' },
];
function feed(trips: Array<[string, string, string[]]>) {
  return {
    routes: [{ route_id: '31009', route_short_name: '2600', route_long_name: 'REGULAR METRORAIL SERVICE', route_type: '2', route_color: 'FF8040' }, { route_id: '1', route_short_name: '1', route_type: '3' }],
    stops,
    trips: trips.map(([trip_id, direction_id]) => ({ trip_id, route_id: '31009', service_id: 'wk', direction_id })),
    stopTimes: trips.flatMap(([trip_id, , at]) => at.map((stop_id, i) => ({ trip_id, stop_id, stop_sequence: String(i + 1) }))),
    fareRules: [{ fare_id: 'rail', route_id: '31009' }],
  } as never;
}

describe('routeSplits (#1287 Miami-Dade Metrorail)', () => {
  it('each trip goes to the line whose station it serves, keeping its direction; 2600 is gone', () => {
    const { gtfs, trips } = splitRoutes(feed([
      ['g1', '0', ['pal', 'ehs', 'dad']], ['o1', '0', ['mia', 'ehs', 'dad']],
      ['g2', '1', ['dad', 'ehs', 'pal']], ['shuttle', '1', ['ehs', 'mia']],
    ]), [SPLIT]) as { gtfs: any; trips: Record<string, number> };
    expect(trips).toEqual({ '31009-Green': 2, '31009-Orange': 2 });
    expect(gtfs.routes.map((r: any) => [r.route_id, r.route_short_name, r.route_long_name, r.route_color])).toEqual([
      ['31009-Green', 'Green', 'Palmetto ↔ Dadeland South', 'A2CF5F'],
      ['31009-Orange', 'Orange', 'Miami International Airport ↔ Dadeland South', 'F04E23'],
      ['1', '1', undefined, undefined],
    ]);
    expect(gtfs.trips.map((t: any) => [t.trip_id, t.route_id, t.direction_id])).toEqual([
      ['g1', '31009-Green', '0'], ['o1', '31009-Orange', '0'], ['g2', '31009-Green', '1'], ['shuttle', '31009-Orange', '1'],
    ]);
    expect(gtfs.fareRules.map((f: any) => f.route_id)).toEqual(['31009-Green', '31009-Orange']);
  });

  it('a trip serving neither station, or both, fails the build', () => {
    expect(() => splitRoutes(feed([['x', '0', ['ehs', 'dad']]]), [SPLIT])).toThrow(/1 trips match no part or more than one, e.g. x \(no part\)/);
    expect(() => splitRoutes(feed([['y', '0', ['pal', 'mia']]]), [SPLIT])).toThrow(/y \(Green and Orange\)/);
  });

  it('the route is found by its short name, whatever its id in this feed version (30979 in the live feed)', () => {
    const gtfs = feed([['g1', '0', ['pal', 'dad']], ['o1', '0', ['mia', 'dad']]]) as any;
    gtfs.routes[0].route_id = '30979';
    for (const t of gtfs.trips) t.route_id = '30979';
    expect(splitRoutes(gtfs, [SPLIT]).trips).toEqual({ '30979-Green': 1, '30979-Orange': 1 });
  });

  it('a configured route the feed no longer has fails the build', () => {
    expect(() => splitRoutes(feed([]), [{ ...SPLIT, routeShortName: '9999' }])).toThrow(/route 9999 is not in the feed/);
  });

  it('legitimate: no splits configured leaves the feed as it is', () => {
    const gtfs = feed([['g1', '0', ['pal', 'dad']]]);
    expect(splitRoutes(gtfs, []).gtfs).toBe(gtfs);
  });

  it('the Miami-Dade config names the two lines with the official map colours', () => {
    const cfg = JSON.parse(readFileSync('config/agencies/miami-dade-transit.json', 'utf8'));
    expect(cfg.routeSplits).toEqual([SPLIT]);
  });
});
