/**
 * CIV-1603: the Frequent service story's weekday-versus-Sunday chart. For a fixed set of cities, counts the routes the main
 * map draws at "every 15 min or better" and "every 30 min or better" on weekdays and on Sundays, with the map's own route
 * filter (shared/frequentDayCounts.ts frequentRouteCount, built on routeFeaturePassesMapFilter).
 *
 * Read-only: reads https://data.transitatlas.fyi/atlas/release.json and that release's agency snapshots (the files the map
 * loads), and writes src/data/frequent-weekend-counts.json. Public-map agencies only: an agency marked hiddenInProduction,
 * betaOnly or staged in public/data/index.json is refused.
 *
 *   nice -n 15 npx tsx scripts/build-frequent-weekend-counts.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERIOD_KEYS, type PeriodKey } from '../shared/config';
import type { DayType } from '../shared/dayTypes';
import { frequentRouteCount, STORY_DAYTIME_PERIODS } from '../shared/frequentDayCounts';
import { normalizeRouteFilterFeatures } from '../shared/routeHeadwayFilter';
import { DEFAULT_R2_PUBLIC_URL } from '../shared/rules/paths';

const BASE = DEFAULT_R2_PUBLIC_URL;
const OUT = 'src/data/frequent-weekend-counts.json';

/**
 * Toronto (the story's own city) and the largest metros Atlas covers in Canada (Montréal, Vancouver) and the US (New York,
 * Los Angeles, Chicago), plus Washington, DC, which the story already names. Each city is its main local transit agency;
 * New York's buses and subway are split across several feeds, so all of them count together.
 */
export const WEEKEND_CITIES: ReadonlyArray<{ city: string; agencies: readonly string[] }> = [
  { city: 'Toronto', agencies: ['ttc'] },
  { city: 'Montréal', agencies: ['stm'] },
  { city: 'Vancouver', agencies: ['translink'] },
  { city: 'New York', agencies: ['nyct-subway', 'nyct-bus-bronx', 'nyct-bus-brooklyn', 'nyct-bus-manhattan', 'nyct-bus-queens', 'nyct-bus-si', 'mta-bus-company'] },
  { city: 'Los Angeles', agencies: ['lacmta'] },
  { city: 'Chicago', agencies: ['cta'] },
  { city: 'Washington, DC', agencies: ['wmata'] },
];

const DAYS: readonly DayType[] = ['Weekday', 'Sunday'];
const THRESHOLDS = [15, 30] as const;
type PeriodCounts = { daytime: number } & Record<PeriodKey, number>;

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const index = JSON.parse(readFileSync(path.join(here, '../public/data/index.json'), 'utf8'));
  const entries: Array<{ slug: string; hiddenInProduction?: boolean; betaOnly?: boolean; staged?: boolean }> =
    Array.isArray(index) ? index : (index.agencies ?? Object.values(index));
  const release = await (await fetch(`${BASE}/atlas/release.json`)).json() as { releaseId: string; agencyPrefix: string };
  console.log(`Release ${release.releaseId}`);

  const cities = [];
  for (const { city, agencies } of WEEKEND_CITIES) {
    const counts = Object.fromEntries(DAYS.map(day => [day, Object.fromEntries(THRESHOLDS.map(t => [t, {
      daytime: 0, ...Object.fromEntries(PERIOD_KEYS.map(p => [p, 0])),
    } as PeriodCounts]))])) as Record<DayType, Record<number, PeriodCounts>>;
    for (const slug of agencies) {
      const entry = entries.find(e => e.slug === slug);
      if (!entry || entry.hiddenInProduction || entry.betaOnly || entry.staged) throw new Error(`${slug} is not on the public map`);
      const res = await fetch(`${BASE}/${release.agencyPrefix.replace(/\/$/, '')}/${slug}.json`);
      if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
      const data = await res.json() as GeoJSON.FeatureCollection;
      normalizeRouteFilterFeatures(data.features as Array<{ properties: Record<string, unknown> }>);
      for (const day of DAYS) for (const t of THRESHOLDS) {
        const c = counts[day][t];
        c.daytime += frequentRouteCount(data.features, slug, day, t, STORY_DAYTIME_PERIODS);
        for (const p of PERIOD_KEYS) c[p] += frequentRouteCount(data.features, slug, day, t, [p]);
      }
      console.log(`  ${city} ${slug}: weekday ≤15 ${counts.Weekday[15].daytime}, Sunday ≤15 ${counts.Sunday[15].daytime}`);
    }
    cities.push({ city, agencies, counts });
  }

  const out = {
    source: {
      releaseId: release.releaseId,
      fetched: new Date().toISOString().slice(0, 10),
      rule: 'Routes the main map draws at every N min or better (routeFeaturePassesMapFilter, worst direction deciding) on that day. "daytime" counts a route only when it passes in AM peak, midday and PM peak, the story map\'s daytime (CIV-1410); each period key counts that period alone.',
      script: 'scripts/build-frequent-weekend-counts.ts',
    },
    cities,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
