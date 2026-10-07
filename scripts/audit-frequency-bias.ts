/**
 * Read-only audit of frequency metrics that can make a route look faster than
 * any one real operating day, branch, or direction supports.
 *
 * Usage:
 *   npx tsx scripts/audit-frequency-bias.ts
 *   npx tsx scripts/audit-frequency-bias.ts --limit=25 --pause-ms=250 --out=/tmp/frequency-bias.json
 */
import { basename, join, resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { computeRawDepartures } from '../pipeline/transit-phase1';
import { determineTier } from '../pipeline/transit-phase2';
import { DEFAULT_CRITERIA, getTiersForCriteria } from '../pipeline/defaults';
import { DAY_TO_TYPE, type GtfsData, type RawRouteDepartures } from '../types/gtfs';

const DATA_DIR = '/Users/ryan/Desktop/Data/GTFS/Files';
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const pauseArg = process.argv.find(arg => arg.startsWith('--pause-ms='));
const outArg = process.argv.find(arg => arg.startsWith('--out='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const pauseMs = pauseArg ? Math.max(0, Number(pauseArg.slice('--pause-ms='.length))) : 250;
const outputPath = outArg ? resolve(outArg.slice('--out='.length)) : null;

type DailyRow = {
  agency: string;
  route: string;
  dir: string;
  day: string;
  dayType: string;
  headsign: string;
  shapeId: string;
  routeVariant: string;
  routeType: string;
  mode: 'surface' | 'rail';
  times: number[];
  tier: string;
  median: number | null;
};

type Example = Record<string, unknown>;

const parse = (text: string): any[] => Papa.parse(text, {
  header: true,
  skipEmptyLines: true,
  transform: (value: string) => value.trim(),
}).data as any[];

const rank = (tier: string): number => tier === 'span' ? Number.POSITIVE_INFINITY : tier === 'infrequent' ? 1e6 : Number(tier);

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const productionTimes = (raw: RawRouteDepartures): number[] => {
  const dayType = DAY_TO_TYPE[raw.day];
  const dayConfig = DEFAULT_CRITERIA.dayTypes[dayType];
  if (!dayConfig) return [];
  let times = raw.departureTimes.filter(time => time >= dayConfig.timeWindow.start && time <= dayConfig.timeWindow.end);
  if (times.length < 2) times = [...raw.departureTimes].sort((a, b) => a - b);
  if (raw.railLike) {
    const midday = times.filter(time => time >= 570 && time <= 870);
    if (midday.length >= 2) times = midday;
  }
  return times;
};

const tierFor = (times: number[], raw: RawRouteDepartures): string => {
  const dayType = DAY_TO_TYPE[raw.day];
  const dayConfig = DEFAULT_CRITERIA.dayTypes[dayType];
  if (!dayConfig || times.length < 2) return 'span';
  const tiers = getTiersForCriteria(raw.routeType, dayConfig.tiers, DEFAULT_CRITERIA.modeTierOverrides);
  const gaps = times.slice(1).map((time, index) => time - times[index]);
  return determineTier(
    gaps,
    times.length,
    times[times.length - 1] - times[0],
    tiers,
    DEFAULT_CRITERIA.graceMinutes,
    DEFAULT_CRITERIA.maxGraceViolations,
    DEFAULT_CRITERIA.gracePercent,
    DEFAULT_CRITERIA.violationPercent,
    DEFAULT_CRITERIA.violationPercentByTier,
  );
};

const readFeed = async (archive: string): Promise<{ data: GtfsData; agency: string } | null> => {
  try {
    const zip = await JSZip.loadAsync(readFileSync(archive));
    const get = async (name: string) => {
      const file = zip.file(name);
      return file ? parse(await file.async('text')) : [];
    };
    const data = {
      routes: await get('routes.txt'),
      trips: await get('trips.txt'),
      stops: await get('stops.txt'),
      stopTimes: await get('stop_times.txt'),
      calendar: await get('calendar.txt'),
      calendarDates: await get('calendar_dates.txt'),
      frequencies: await get('frequencies.txt'),
      agencies: await get('agency.txt'),
      shapes: [],
    } as unknown as GtfsData;
    return { data, agency: data.agencies?.[0]?.agency_name ?? basename(archive, '.zip') };
  } catch {
    return null;
  }
};

const archives = readdirSync(DATA_DIR, { recursive: true })
  .filter((path): path is string => typeof path === 'string' && path.endsWith('.zip'))
  .map(path => join(DATA_DIR, path))
  .slice(0, Number.isFinite(limit) ? limit : undefined);

const dailyRows: DailyRow[] = [];
const skippedFeeds: string[] = [];
const agencies = new Set<string>();

for (let index = 0; index < archives.length; index++) {
  if (index % 25 === 0) console.error(`processed ${index}/${archives.length}`);
  const archive = archives[index];
  const feed = await readFeed(archive);
  if (!feed) {
    skippedFeeds.push(archive);
    continue;
  }
  agencies.add(feed.agency);
  let rawRows: RawRouteDepartures[];
  try {
    rawRows = computeRawDepartures(feed.data);
  } catch {
    skippedFeeds.push(archive);
    continue;
  }
  for (const raw of rawRows) {
    const times = productionTimes(raw);
    if (times.length < 2) continue;
    dailyRows.push({
      agency: feed.agency,
      route: raw.route,
      dir: raw.dir,
      day: raw.day,
      dayType: DAY_TO_TYPE[raw.day],
      headsign: raw.headsign ?? '',
      shapeId: raw.shapeId ?? '',
      routeVariant: raw.routeVariant ?? '',
      routeType: raw.routeType,
      mode: raw.railLike ? 'rail' : 'surface',
      times,
      tier: tierFor(times, raw),
      median: median(times.slice(1).map((time, i) => time - times[i])),
    });
  }
  if (pauseMs > 0) await new Promise(resolvePause => setTimeout(resolvePause, pauseMs));
}

const grouped = new Map<string, DailyRow[]>();
const add = (key: string, row: DailyRow) => {
  const rows = grouped.get(key);
  if (rows) rows.push(row);
  else grouped.set(key, [row]);
};
for (const row of dailyRows) {
  add([row.agency, row.route, row.dir, row.dayType, row.headsign, row.shapeId, row.routeVariant].join('::'), row);
}

const metric = {
  weekdayGroups: 0,
  weekdayMergedTierUpgrades: 0,
  weekdayMergedTierDowngrades: 0,
  weekdayMergedMedianFaster: 0,
  weekdayMergedMedianFasterByAtLeastFiveMinutes: 0,
  weekdayMergedTierUpgradesByMode: {} as Record<string, number>,
  weekdayMergedMedianFasterByMode: {} as Record<string, number>,
  weekdayMergedTierUpgradesByWorstTier: {} as Record<string, number>,
  weekdayMergedTierUpgradesByMedianTrips: {} as Record<string, number>,
  weekdayMergedMedianFasterByMedianTrips: {} as Record<string, number>,
  weekdayMergedMedianFasterByDailyMedian: {} as Record<string, number>,
  weekdayTierVariationGroups: 0,
  weekdayTierVariationByMode: {} as Record<string, number>,
  weekdayMedianRangeAtLeastFive: 0,
  weekdayMedianRangeAtLeastTwofold: 0,
  branchGroups: 0,
  branchMixingTierUpgrades: 0,
  branchMixingMedianFaster: 0,
  branchMixingTierUpgradesByMode: {} as Record<string, number>,
  examples: {
    weekdayTierUpgrades: [] as Example[],
    weekdayMedianFaster: [] as Example[],
    weekdayTierVariation: [] as Example[],
    branchMixing: [] as Example[],
  },
};

const addExample = (bucket: Example[], example: Example) => {
  if (bucket.length < 50) bucket.push(example);
};
const increment = (record: Record<string, number>, key: string) => {
  record[key] = (record[key] ?? 0) + 1;
};
const bucket = (value: number): string => value <= 2 ? '2' : value <= 4 ? '3-4' : value <= 8 ? '5-8' : value <= 15 ? '9-15' : value <= 30 ? '16-30' : value <= 60 ? '31-60' : '61+';

for (const [key, rows] of grouped) {
  const weekdayRows = rows.filter(row => row.dayType === 'Weekday');
  if (weekdayRows.length < 2) continue;
  metric.weekdayGroups++;
  const mergedTimes = [...new Set(weekdayRows.flatMap(row => row.times))].sort((a, b) => a - b);
  const representative = weekdayRows[0];
  const mergedTier = tierFor(mergedTimes, representative as RawRouteDepartures);
  const worstTier = weekdayRows.reduce((worst, row) => rank(row.tier) > rank(worst) ? row.tier : worst, weekdayRows[0].tier);
  const dayMedians = weekdayRows.map(row => row.median).filter((value): value is number => value != null);
  const dailyMedian = median(dayMedians);
  const mergedMedian = median(mergedTimes.slice(1).map((time, i) => time - mergedTimes[i]));
  const dailyTierNames = new Set(weekdayRows.map(row => row.tier));
  if (dailyTierNames.size > 1) {
    metric.weekdayTierVariationGroups++;
    increment(metric.weekdayTierVariationByMode, weekdayRows[0].mode);
    addExample(metric.examples.weekdayTierVariation, {
      key,
      days: weekdayRows.map(row => row.day),
      dailyTiers: weekdayRows.map(row => row.tier),
      dailyMedians: weekdayRows.map(row => row.median),
      dailyTripCounts: weekdayRows.map(row => row.times.length),
    });
  }
  if (dayMedians.length >= 2) {
    const medianRange = Math.max(...dayMedians) - Math.min(...dayMedians);
    if (medianRange >= 5) metric.weekdayMedianRangeAtLeastFive++;
    if (Math.min(...dayMedians) > 0 && Math.max(...dayMedians) / Math.min(...dayMedians) >= 2) {
      metric.weekdayMedianRangeAtLeastTwofold++;
    }
  }
  if (rank(mergedTier) < rank(worstTier)) {
    metric.weekdayMergedTierUpgrades++;
    increment(metric.weekdayMergedTierUpgradesByMode, weekdayRows[0].mode);
    increment(metric.weekdayMergedTierUpgradesByWorstTier, worstTier);
    increment(metric.weekdayMergedTierUpgradesByMedianTrips, bucket(median(weekdayRows.map(row => row.times.length)) ?? 0));
    addExample(metric.examples.weekdayTierUpgrades, { key, days: weekdayRows.map(row => row.day), dailyTiers: weekdayRows.map(row => row.tier), mergedTier, dailyTripCounts: weekdayRows.map(row => row.times.length), mergedTripCount: mergedTimes.length });
  } else if (rank(mergedTier) > rank(worstTier)) {
    metric.weekdayMergedTierDowngrades++;
  }
  if (dailyMedian != null && mergedMedian != null && mergedMedian < dailyMedian) {
    metric.weekdayMergedMedianFaster++;
    increment(metric.weekdayMergedMedianFasterByMode, weekdayRows[0].mode);
    increment(metric.weekdayMergedMedianFasterByMedianTrips, bucket(median(weekdayRows.map(row => row.times.length)) ?? 0));
    increment(metric.weekdayMergedMedianFasterByDailyMedian, bucket(dailyMedian));
    if (dailyMedian - mergedMedian >= 5) metric.weekdayMergedMedianFasterByAtLeastFiveMinutes++;
    addExample(metric.examples.weekdayMedianFaster, { key, days: weekdayRows.map(row => row.day), dailyMedians: weekdayRows.map(row => row.median), dailyMedian, mergedMedian, dailyTripCounts: weekdayRows.map(row => row.times.length), mergedTripCount: mergedTimes.length });
  }
}

const routeDayGroups = new Map<string, DailyRow[]>();
for (const row of dailyRows) addToRouteDay(routeDayGroups, row);

function addToRouteDay(map: Map<string, DailyRow[]>, row: DailyRow): void {
  const key = [row.agency, row.route, row.dir, row.dayType, row.day].join('::');
  const rows = map.get(key);
  if (rows) rows.push(row);
  else map.set(key, [row]);
}

for (const [key, rows] of routeDayGroups) {
  const branchRows = rows.filter(row => row.headsign || row.shapeId || row.routeVariant);
  if (branchRows.length < 2) continue;
  metric.branchGroups++;
  const combinedTimes = [...new Set(rows.flatMap(row => row.times))].sort((a, b) => a - b);
  const combinedTier = tierFor(combinedTimes, rows[0] as RawRouteDepartures);
  const slowestBranchTier = rows.reduce((slowest, row) => rank(row.tier) > rank(slowest) ? row.tier : slowest, rows[0].tier);
  if (rank(combinedTier) < rank(slowestBranchTier)) {
    metric.branchMixingTierUpgrades++;
    increment(metric.branchMixingTierUpgradesByMode, rows[0].mode);
    addExample(metric.examples.branchMixing, { key, branches: rows.map(row => ({ headsign: row.headsign, shapeId: row.shapeId, routeVariant: row.routeVariant, tier: row.tier, trips: row.times.length })), combinedTier });
  }
  const branchMedians = rows.map(row => row.median).filter((value): value is number => value != null);
  const combinedMedian = median(combinedTimes.slice(1).map((time, i) => time - combinedTimes[i]));
  const slowestMedian = Math.max(...branchMedians);
  if (combinedMedian != null && Number.isFinite(slowestMedian) && combinedMedian < slowestMedian) metric.branchMixingMedianFaster++;
}

const output = {
  archiveCount: archives.length,
  skippedFeeds: skippedFeeds.length,
  feedsWithRows: agencies.size,
  dailyRows: dailyRows.length,
  distinctAgencies: agencies.size,
  distinctRouteDayGroups: routeDayGroups.size,
  metrics: metric,
};

if (outputPath) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}
console.log(JSON.stringify(output, null, 2));
