import { describe, expect, it } from 'vitest';
import { mergeDirectionSplitRoutes } from '../directionSplitRoutes';

// Shapes of the #1285 sweep: BART publishes each line once per direction ("Yellow-S" Antioch to SFO,
// "Yellow-N" SFO to Antioch), on direction-specific platforms under one parent station; SEPTA's
// Chestnut Hill East and West are two lines, each run both ways, on different stations.
const route = (route_id: string, route_short_name: string, route_long_name: string, route_type = '1', route_color = 'FFFF33') =>
  ({ route_id, route_short_name, route_long_name, route_type, route_color });
const stations = ['ANTC', 'PITT', 'MONT', 'SFIA', 'MLBR'];
const stops = stations.flatMap(s => [
  { stop_id: `${s}-1`, stop_name: `${s} platform 1`, parent_station: s, stop_lat: '0', stop_lon: '0' },
  { stop_id: `${s}-2`, stop_name: `${s} platform 2`, parent_station: s, stop_lat: '0', stop_lon: '0' },
]);
function trips(routeId: string, dir: string, n: number, platform: '1' | '2', at = stations) {
  return Array.from({ length: n }, (_, i) => ({ trip: { trip_id: `${routeId}-${dir}-${i}`, route_id: routeId, service_id: 'wk', direction_id: dir }, platform, at }));
}
function feed(routes: ReturnType<typeof route>[], runs: ReturnType<typeof trips>[]) {
  const all = runs.flat();
  return {
    routes,
    stops,
    trips: all.map(r => r.trip),
    stopTimes: all.flatMap(r => r.at.map((s, i) => ({ trip_id: r.trip.trip_id, stop_id: `${s}-${r.platform}`, stop_sequence: String(i + 1) }))),
    fareRules: [{ fare_id: 'f', route_id: 'Y-N' }],
  } as never;
}

describe('direction-split routes (#1285)', () => {
  it('BART Yellow: the two direction routes become one route "Yellow" with both directions', () => {
    const gtfs = feed(
      [route('Y-S', 'Yellow-S', "Antioch to SF Int'l Airport SFO/Millbrae"), route('Y-N', 'Yellow-N', "Millbrae/SF Int'l SFO to Antioch")],
      // Yellow-N runs some trips the other way (60 of 379 in the feed); its dominant direction still decides.
      [trips('Y-S', '1', 10, '1'), trips('Y-N', '0', 8, '2'), trips('Y-N', '1', 2, '1')],
    );
    const { gtfs: out, merged } = mergeDirectionSplitRoutes(gtfs) as { gtfs: any; merged: any[] };
    expect(merged).toEqual([{ base: 'Yellow', keptRouteId: 'Y-N', mergedRouteId: 'Y-S', overlap: 1 }]);
    expect(out.routes).toEqual([expect.objectContaining({ route_id: 'Y-N', route_short_name: 'Yellow', route_long_name: "Millbrae/SF Int'l SFO ↔ Antioch" })]);
    expect(new Set(out.trips.map((t: any) => t.route_id))).toEqual(new Set(['Y-N']));
    // Each half is one travel direction: Yellow-N's two trips labelled direction 1 run its way too.
    expect(out.trips.filter((t: any) => t.direction_id === '1').map((t: any) => t.trip_id)).toEqual(Array.from({ length: 10 }, (_, i) => `Y-S-1-${i}`));
    expect(out.trips.filter((t: any) => t.direction_id === '0')).toHaveLength(10);
    expect(out.fareRules).toEqual([{ fare_id: 'f', route_id: 'Y-N' }]);
  });

  it('legitimate: BART Bus Bridge A and B (no direction suffix) are left alone', () => {
    const gtfs = feed(
      [route('BB-A', 'BridgeA', 'Bus Bridge', '3', '000000'), route('BB-B', 'BridgeB', 'Bus Bridge', '3', '000000')],
      [trips('BB-A', '0', 4, '1'), trips('BB-B', '1', 4, '2')],
    );
    expect(mergeDirectionSplitRoutes(gtfs).merged).toEqual([]);
  });

  it('legitimate: SEPTA Chestnut Hill East and West stay two lines (each runs both ways, different stations)', () => {
    const east = ['ANTC', 'PITT', 'MONT'], west = ['SFIA', 'MLBR', 'MONT'];
    const gtfs = feed(
      [route('CHE', 'CHE', 'Chestnut Hill East Line', '2', 'FF0000'), route('CHW', 'CHW', 'Chestnut Hill West Line', '2', 'FF0000')],
      [trips('CHE', '0', 4, '1', east), trips('CHE', '1', 4, '2', east), trips('CHW', '0', 4, '1', west), trips('CHW', '1', 4, '2', west)],
    );
    expect(mergeDirectionSplitRoutes(gtfs).merged).toEqual([]);
  });

  it('legitimate: one-way routes that share under 0.8 of their stations stay apart (Sudbury 1S and 1N)', () => {
    const gtfs = feed(
      [route('1S', '1S', 'Main Line South End', '3', '0000FF'), route('1N', '1N', 'Main Line New Sudbury', '3', '0000FF')],
      [trips('1S', '0', 4, '1', ['ANTC', 'PITT', 'MONT']), trips('1N', '1', 4, '2', ['MONT', 'SFIA', 'MLBR'])],
    );
    expect(mergeDirectionSplitRoutes(gtfs).merged).toEqual([]);
  });

  it('legitimate: a pair running the same direction, or of different colors, stays apart', () => {
    const same = feed([route('A', 'Red-N', 'x'), route('B', 'Red-S', 'y')], [trips('A', '0', 4, '1'), trips('B', '0', 4, '2')]);
    expect(mergeDirectionSplitRoutes(same).merged).toEqual([]);
    const colors = feed([route('A', 'Red-N', 'x'), route('B', 'Red-S', 'y', '1', '00FF00')], [trips('A', '0', 4, '1'), trips('B', '1', 4, '2')]);
    expect(mergeDirectionSplitRoutes(colors).merged).toEqual([]);
  });
});
