#!/usr/bin/env npx tsx
/**
 * Rebuilds scripts/__fixtures__/headway-filter-routes.json, the frozen real-route features that
 * src/utils/__tests__/routeHeadwayFilter.test.ts checks the one frequency-filter rule on.
 *
 * Run it on a report-only reprocess output (or a downloaded release's agency folder) whenever the
 * fields the filter reads change, then rerun the test and check every changed expectation against
 * the GTFS oracle (scripts/handcheck/stretch-departures.py) before accepting it:
 *
 *   npm run reprocess-derived-artifacts -- --only-slug miway --only-slug translink --only-slug ttc \
 *     --only-slug lacmta --only-slug cta
 *   npx tsx scripts/build-headway-filter-fixture.ts tmp/derived-reprocess "<source note>"
 *
 * Keeps the same routes (Weekday, plus MiWay 3 Saturday), the route-level fields the filter and
 * cards read, and only the first and last point of each line.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROUTES: Record<string, string[]> = {
  miway: ['109', '110', '13', '2', '28', '3', '38', '6', '8'],
  translink: ['014', '025', '041', '049', '084', '099', 'N9', 'R4'],
  ttc: ['100', '506', '63', '84'],
  lacmta: ['51'],
  cta: ['77'],
};
const SATURDAY: Record<string, string[]> = { miway: ['3'] };

const KEEP = [
  'baseFare', 'busSubType', 'day', 'directionId', 'frequentService', 'headsign', 'headsignMinStopHeadwayByPeriod',
  'headway', 'headwayByHour', 'headwayByPeriod', 'headwayByPeriodSustained', 'headwayRangeByPeriod', 'maxGapByPeriod',
  'minStopHeadway', 'minStopHeadwayByPeriod', 'nightService', 'nightService30', 'nightService60', 'periodCoverageHeadway',
  'researchFrequentService', 'routeBranch', 'routeColor', 'routeHasLimitedDirection', 'routeId', 'routeLongName',
  'routeShortName', 'routeType', 'routeVariant', 'serviceClass', 'tier', 'worstDirectionHeadway',
  'worstDirectionHeadwayByPeriod', 'worstDirectionPeriodCoverageHeadway', 'worstDirectionMiddayCap',
  'partialWeekdayServiceByPeriod',
  // Frequency focus step 5a: the stretch selector's filter value and "runs in the period" flag.
  'routeFilterHeadwayByPeriod', 'routeRunsByPeriod', 'directionFilterHeadwayByPeriod',
];

const [dir, source] = process.argv.slice(2);
if (!dir || !source) {
  console.error('usage: build-headway-filter-fixture.ts <derived dir> "<source note>"');
  process.exit(1);
}

const agencies: Record<string, unknown[]> = {};
for (const [slug, routes] of Object.entries(ROUTES)) {
  const fc = JSON.parse(readFileSync(join(resolve(dir), slug, `${slug}.json`), 'utf8')) as { features: Array<{ geometry: any; properties: Record<string, unknown> }> };
  agencies[slug] = fc.features
    .filter(f => f.properties.stopId == null && f.geometry?.type === 'LineString')
    .filter(f => routes.includes(String(f.properties.routeShortName))
      && (f.properties.day === 'Weekday' || (f.properties.day === 'Saturday' && (SATURDAY[slug] ?? []).includes(String(f.properties.routeShortName)))))
    .map(f => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [f.geometry.coordinates[0], f.geometry.coordinates.at(-1)] },
      properties: Object.fromEntries(KEEP.filter(k => f.properties[k] !== undefined).map(k => [k, f.properties[k]])),
    }));
  console.log(`${slug}: ${agencies[slug].length} features`);
}
writeFileSync(resolve('scripts/__fixtures__/headway-filter-routes.json'), JSON.stringify({ source, agencies }, null, 1) + '\n');
