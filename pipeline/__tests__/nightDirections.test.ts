import { describe, expect, it } from 'vitest';
import { combineRowNightDirections } from '../process-core';
import { extractNightServiceRoutes } from '../nightServiceIndex';
import { routePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';
import { routeRunsThroughNight } from '../../shared/nightService';
import { countNightRoutesInView } from '../../src/utils/nightRoutesInView';
import { selectNightServiceFeatures } from '../../src/components/Interval/map/useOverlaySources';

// CIV-1331 review: a made-up route without stop-by-stop (stretch) data, graded row by row. One direction passes the night
// check, the other fails, so the route must fail on every surface once the pipeline combines its directions.
const bounds = { s: 43.6, w: -79.5, n: 43.7, e: -79.3 };
function rows(dir1Passes: boolean) {
  const row = (directionId: number, passes: boolean): GeoJSON.Feature => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[-79.4, 43.65], [-79.39, 43.66]] },
    properties: {
      agencySlug: 'madeup', routeId: 'X', routeShortName: 'X', directionId, day: 'Weekday', tier: '30',
      headwayByPeriod: { overnight: 30 }, periodCoverageHeadway: { overnight: 30 },
      nightService30: false, nightService60: passes, nightService90: passes, nightService: passes,
    },
  });
  const features = [row(0, true), row(1, dir1Passes)];
  combineRowNightDirections(features.map(f => ({ routeDay: 'X::Weekday', dirId: f.properties!.directionId as number, props: f.properties as Record<string, unknown> })));
  return features;
}
const surfaces = (features: GeoJSON.Feature[]) => ({
  rowFlags: features.map(f => f.properties!.nightService90),
  nightServiceIndex: extractNightServiceRoutes('madeup', 'Made Up', null, features as never).length,
  nightPageCount: countNightRoutesInView({ madeup: { type: 'FeatureCollection', features } }, 90, bounds).routes,
  mapOverlay: selectNightServiceFeatures({ madeup: { type: 'FeatureCollection', features } }, 90).length,
  overnightFilter: routePassesHeadwayFilter(features.map(f => f.properties!), 'overnight', 'Weekday', Infinity),
  routeCard: routeRunsThroughNight(features.map(f => f.properties as never)),
});

describe('rows without stretch data: every direction must run through the night (CIV-1331)', () => {
  it('one direction passing and the other failing fails on every surface', () => {
    expect(surfaces(rows(false))).toEqual({ rowFlags: [false, false], nightServiceIndex: 0, nightPageCount: 0, mapOverlay: 0, overnightFilter: false, routeCard: false });
  });
  it('both directions passing passes on every surface', () => {
    expect(surfaces(rows(true))).toEqual({ rowFlags: [true, true], nightServiceIndex: 2, nightPageCount: 1, mapOverlay: 2, overnightFilter: true, routeCard: true });
  });
});
