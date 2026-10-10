import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { featurePassesHeadwayFilter, normalizeRouteFilterFeatures, routeFilterHeadway, routePassesHeadwayFilter } from '../../../shared/routeHeadwayFilter';
import { passesRouteFilter, type ShapeProperties } from '../../hooks/useIntervalStats';

const fixture = JSON.parse(readFileSync(path.join(__dirname, '../../../scripts/__fixtures__/headway-filter-routes.json'), 'utf8')) as {
  agencies: Record<string, Array<{ properties: Record<string, any> }>>;
};

function routeFeatures(agency: string, shortName: string) {
  const features = JSON.parse(JSON.stringify(fixture.agencies[agency]));
  normalizeRouteFilterFeatures(features);
  return features
    .map((f: { properties: Record<string, any> }) => f.properties)
    .filter((p: Record<string, any>) => p.routeShortName === shortName);
}

const appPasses = (p: object, period: 'all' | 'overnight', maxHeadway: number) =>
  passesRouteFilter(p as ShapeProperties, 'test', { maxHeadway, agencies: new Set(), modes: new Set(), day: 'Weekday', period }, null);

describe('the one frequency-filter rule: worst direction decides', () => {
  // MiWay 3 Bloor, weekday overnight (release 2026-10-09). Toward Kipling: typical 25, busiest
  // stretch 16, worst direction 30. Toward City Centre: 30 / 30 / 30. The busiest-stretch 16 used
  // to make the app count it under "every 20 min or less" while the map hid it.
  const miway3 = () => routeFeatures('miway', '3');

  it('MiWay 3 overnight carries the real values this regression is about', () => {
    const [kipling, cityCentre] = ['Kipling Terminal', 'City Centre'].map(h => miway3().find((p: any) => p.headsign === h));
    expect(kipling.headwayByPeriod.overnight).toBe(25);
    expect(kipling.headsignMinStopHeadwayByPeriod.overnight).toBe(16);
    expect(kipling.worstDirectionHeadwayByPeriod.overnight).toBe(30);
    expect(cityCentre.headwayByPeriod.overnight).toBe(30);
    expect(cityCentre.headsignMinStopHeadwayByPeriod.overnight).toBe(30);
  });

  it('MiWay 3 overnight fails every-20 and every-25, passes every-30, in every surface', () => {
    const features = miway3();
    expect(features).toHaveLength(2);
    for (const p of features) {
      expect(routeFilterHeadway(p, 'overnight')).toBe(30);
      expect(featurePassesHeadwayFilter(p, 'overnight', 20)).toBe(false);
      expect(featurePassesHeadwayFilter(p, 'overnight', 25)).toBe(false);
      expect(featurePassesHeadwayFilter(p, 'overnight', 30)).toBe(true);
      expect(appPasses(p, 'overnight', 20)).toBe(false);
      expect(appPasses(p, 'overnight', 30)).toBe(true);
    }
    expect(routePassesHeadwayFilter(features, 'overnight', 'Weekday', 20)).toBe(false);
    expect(routePassesHeadwayFilter(features, 'overnight', 'Weekday', 25)).toBe(false);
    expect(routePassesHeadwayFilter(features, 'overnight', 'Weekday', 30)).toBe(true);
  });

  it('TransLink 99 AM peak: rows keep their own cadence (#564) but the slow branch decides the filter', () => {
    const features = routeFeatures('translink', '099');
    const ubc = features.find((p: any) => p.headsign === 'UBC Exchange');
    // The display half of #564 (a branch row shows its own cadence, not the route-wide worst) is
    // unchanged and covered in effectiveHeadway.test.ts. The eligibility half is reversed by the
    // owner rule: the Boundary Loop branch runs every 23 min in AM peak, so 99 is not "every 20".
    expect(routeFilterHeadway(ubc, 'amPeak')).toBe(23);
    expect(routePassesHeadwayFilter(features, 'amPeak', 'Weekday', 20)).toBe(false);
    expect(routePassesHeadwayFilter(features, 'amPeak', 'Weekday', 30)).toBe(true);
  });

  it('never lets the busiest stop decide the all-day filter', () => {
    const p = { routeId: 'x', day: 'Weekday', headway: 25, minStopHeadway: 8 };
    expect(routeFilterHeadway(p, 'all')).toBe(25);
    expect(featurePassesHeadwayFilter(p, 'all', 10)).toBe(false);
    expect(featurePassesHeadwayFilter(p, 'all', 30)).toBe(true);
    const onlyBusiestStop = { routeId: 'y', day: 'Weekday', minStopHeadway: 8 };
    expect(featurePassesHeadwayFilter(onlyBusiestStop, 'all', 10)).toBe(false);
  });

  it('never lets a period busiest-stretch or headsign-trunk value decide a period filter', () => {
    const p = {
      routeId: 'z', day: 'Weekday', directionId: 0,
      headwayByPeriod: { midday: 12 },
      headwayByPeriodSustained: { midday: true },
      worstDirectionHeadwayByPeriod: { midday: 24 },
      minStopHeadwayByPeriod: { midday: 6 },
      headsignMinStopHeadwayByPeriod: { midday: 6 },
      periodCoverageHeadway: { midday: 26 },
      worstDirectionPeriodCoverageHeadway: { midday: 28 },
    };
    expect(routeFilterHeadway(p, 'midday')).toBe(24);
    expect(featurePassesHeadwayFilter(p, 'midday', 20)).toBe(false);
    expect(featurePassesHeadwayFilter(p, 'midday', 30)).toBe(true);
  });

  it('Frequency = All with a period still requires service in that period', () => {
    expect(featurePassesHeadwayFilter({ routeId: 'a', headwayByPeriod: { overnight: null } }, 'overnight', Infinity)).toBe(false);
    expect(featurePassesHeadwayFilter({ routeId: 'a', headwayByPeriod: { overnight: 40 } }, 'overnight', Infinity)).toBe(true);
    expect(featurePassesHeadwayFilter({ routeId: 'a' }, 'all', Infinity)).toBe(true);
  });
});
