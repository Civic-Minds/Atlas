import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { separateSameNameRoutes, type SameNameRoute } from '../same-name-routes';

// #1289: separate lines a feed publishes under one short name get the names Ryan approved (2026-11-02).
type Run = { route: string; dir: string; stops: string[] };
function feed(routes: Array<[string, string, string]>, runs: Run[]) {
  const trips = runs.map((r, i) => ({ trip_id: `t${i}`, route_id: r.route, service_id: 'wk', direction_id: r.dir }));
  return {
    routes: routes.map(([route_id, route_short_name, route_long_name]) => ({ route_id, route_short_name, route_long_name, route_type: '2' })),
    stops: [...new Set(runs.flatMap(r => r.stops))].map(stop_id => ({ stop_id, stop_name: stop_id })),
    trips,
    stopTimes: runs.flatMap((r, i) => r.stops.map((stop_id, j) => ({ trip_id: `t${i}`, stop_id, stop_sequence: String(j + 1) }))),
  } as never;
}
const both = (route: string, stops: string[]): Run[] => [{ route, dir: '0', stops }, { route, dir: '1', stops: [...stops].reverse() }];
const cfg = (slug: string) => JSON.parse(readFileSync(`config/agencies/${slug}.json`, 'utf8')).sameNameRoutes as SameNameRoute[];
const names = (out: any) => out.gtfs.routes.map((r: any) => [r.route_id, r.route_short_name, r.route_long_name]);

describe('separate lines sharing a short name (#1289)', () => {
  it('MARC: Brunswick, Penn and Camden become their own lines, named as MARC names them', () => {
    const gtfs = feed(
      [['11704', 'MARC', 'BRUNSWICK - WASHINGTON'], ['11705', 'MARC', 'PENN - WASHINGTON'], ['11706', 'MARC', 'CAMDEN - WASHINGTON']],
      // They meet only at Washington Union Station.
      [...both('11704', ['brk', 'pob', 'gai', 'ror', 'was']), ...both('11705', ['prs', 'abd', 'bal', 'nca', 'was']), ...both('11706', ['cam', 'jes', 'dor', 'lau', 'was'])],
    );
    const out = separateSameNameRoutes(gtfs, cfg('marc'));
    expect(names(out)).toEqual([['11704', 'Brunswick Line', ''], ['11705', 'Penn Line', ''], ['11706', 'Camden Line', '']]);
  });

  it('NYC S: the three shuttles split, as the S line map names them', () => {
    const gtfs = feed(
      [['GS', 'S', '42 St Shuttle'], ['FS', 'S', 'Franklin Avenue Shuttle'], ['H', 'S', 'Rockaway Park Shuttle']],
      [...both('GS', ['tsq', 'gct']), ...both('FS', ['fra', 'pkp']), ...both('H', ['bch', 'rpk'])],
    );
    expect(names(separateSameNameRoutes(gtfs, cfg('nyct-subway'))).map((r: string[]) => r[1])).toEqual(['42 St Shuttle', 'Franklin Shuttle', 'Rockaway Shuttle']);
  });

  it('Metro St Louis 4: a one-way loop counts as running both ways', () => {
    const gtfs = feed([['19750', '4', 'Natural Bridge'], ['19795', '4', '19th & Central']],
      [...both('19750', ['a', 'b', 'c']), { route: '19795', dir: '0', stops: ['x', 'y', 'z', 'x'] }]);
    expect(names(separateSameNameRoutes(gtfs, cfg('metrostlouis'))).map((r: string[]) => r[1])).toEqual(['4 Natural Bridge', '4 19th & Central']);
  });

  it('Edmonton: ETS 610 keeps its name, Fort Saskatchewan 610 becomes "610 Westpark"', () => {
    const gtfs = feed([['610', '610', "O'Leary - Lago Lindo"], ['F610', '610', 'Westpark']], [...both('610', ['a', 'b']), ...both('F610', ['c', 'd'])]);
    expect(names(separateSameNameRoutes(gtfs, cfg('edmonton')))).toEqual([['610', '610', "O'Leary - Lago Lindo"], ['F610', '610 Westpark', '']]);
  });

  it('legitimate: STL 12 stays one route (one route per direction, the long name its destination)', () => {
    const gtfs = feed([['12E', '12', 'Pont-Viau'], ['12W', '12', 'Métro Cartier']],
      [{ route: '12E', dir: '0', stops: ['a', 'b', 'c'] }, { route: '12W', dir: '1', stops: ['c2', 'b2', 'a2'] }]);
    expect(separateSameNameRoutes(gtfs).splits).toEqual([]);
  });

  it('legitimate: a variant pair stays one route (MTD 3 Lavender and Lavender Alternate: shared stops; 17 Cherry Alternate: contained name)', () => {
    const shared = feed([['L', '3', 'Lavender'], ['LA', '3', 'Lavender Alternate']], [...both('L', ['a', 'b', 'c', 'd']), ...both('LA', ['a', 'b', 'c', 'e'])]);
    expect(separateSameNameRoutes(shared).splits).toEqual([]);
    const contained = feed([['C', '17', 'Cherry'], ['CA', '17', 'Cherry Alternate']], [...both('C', ['a', 'b']), ...both('CA', ['c', 'd'])]);
    expect(separateSameNameRoutes(contained).splits).toEqual([]);
  });

  it('separate lines with no configured names fail the build, naming what to add', () => {
    const gtfs = feed([['1', 'X', 'North Line'], ['2', 'X', 'South Line']], [...both('1', ['a', 'b']), ...both('2', ['c', 'd'])]);
    expect(() => separateSameNameRoutes(gtfs)).toThrow(/"X" routes are separate lines but have no distinct names; add sameNameRoutes entries .*"North Line" \(1\), "South Line" \(2\)/);
  });
});
