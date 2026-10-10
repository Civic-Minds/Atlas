import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeRouteFilterFeatures, routePassesHeadwayFilter } from '../../../shared/routeHeadwayFilter';
import { buildCompareRow } from '../compareRows';

const fixture = JSON.parse(readFileSync(path.join(__dirname, '../../../scripts/__fixtures__/headway-filter-routes.json'), 'utf8')) as {
  agencies: Record<string, GeoJSON.Feature[]>;
};

function routeFeatures(agency: string, shortName: string): GeoJSON.Feature[] {
  const features = JSON.parse(JSON.stringify(fixture.agencies[agency])) as GeoJSON.Feature[];
  normalizeRouteFilterFeatures(features);
  return features.filter(f => (f.properties as any).routeShortName === shortName);
}

const filters = (maxHeadway: number) => ({ maxHeadway, agencies: new Set<string>(), modes: new Set<number>() });

describe('compare mode route rows use the shared filter rule on each side', () => {
  // Real frozen data: MiWay 3 Bloor has Weekday and Saturday features in the fixture.
  const features = routeFeatures('miway', '3');

  it('has both days to compare', () => {
    const days = new Set(features.map(f => (f.properties as any).day));
    expect(days).toEqual(new Set(['Weekday', 'Saturday']));
  });

  for (const period of ['all', 'midday', 'overnight'] as const) {
    for (const maxHeadway of [20, 30, 60]) {
      it(`${period}, every ${maxHeadway}: each side matches routePassesHeadwayFilter`, () => {
        for (const [label, day] of [['A', 'Weekday'], ['B', 'Saturday']] as const) {
          const row = buildCompareRow(label, { day, period }, features, 'miway', filters(maxHeadway));
          const expected = routePassesHeadwayFilter(features.map(f => f.properties as object), period, day, maxHeadway);
          expect(row.passes).toBe(expected);
          expect(row.runs).toBe(true);
          // The number shown is the one the filter judges, so it can't contradict the tick or cross.
          if (row.passes) expect(row.headway).not.toBeNull();
          if (row.headway != null) expect(row.headway <= maxHeadway).toBe(row.passes);
        }
      });
    }
  }

  it('reports no service on a day the route does not run', () => {
    const row = buildCompareRow('B', { day: 'Sunday', period: 'midday' }, features, 'miway', filters(20));
    expect(row).toMatchObject({ runs: false, passes: false, headway: null });
  });
});
