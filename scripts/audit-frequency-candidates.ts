import { readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { computeRawDepartures } from '../pipeline/transit-phase1';
import { determineTier } from '../pipeline/transit-phase2';
import { DEFAULT_CRITERIA, getTiersForCriteria } from '../pipeline/defaults';
import { DAY_TO_TYPE, GtfsData, RawRouteDepartures } from '../types/gtfs';
import { TIME_PERIODS } from '../shared/config';
import {
  CURRENT_INTERNAL_POLICY,
  INTERNAL_CANDIDATES,
  CandidateRuleOptions,
  EdgeLimit,
  EdgeMode,
  HardGapPolicy,
  determineCandidateTier,
} from './frequency-candidate-rules';

type CandidateGroup = 'edge' | 'internal' | 'hardGap';
type Candidate = CandidateRuleOptions & { name: string; group: CandidateGroup };
type Period = {
  feed: string;
  route: string;
  day: string;
  dayType: string;
  dir: string;
  headsign: string;
  shapeId: string;
  routeType: string;
  mode: string;
  times: number[];
  tiers: number[];
  currentTier: string;
  gapBucket: string;
};

const parse = (text: string) => Papa.parse(text, {
  header: true,
  skipEmptyLines: true,
  transform: (value: string) => value.trim(),
}).data as any[];

const allArchives = readdirSync('/Users/ryan/Desktop/Data/GTFS/Files', { recursive: true })
  .filter((path): path is string => typeof path === 'string' && path.endsWith('.zip'))
  .map(path => join('/Users/ryan/Desktop/Data/GTFS/Files', path));

const candidates: Candidate[] = [];
const edgeModes: EdgeMode[] = ['opening', 'closing', 'both'];
const edgeLimits: EdgeLimit[] = ['grace', 'double'];
for (const edgeMode of edgeModes) {
  for (const edgeLimit of edgeLimits) {
    candidates.push({
      name: `edge-${edgeMode}-${edgeLimit}`,
      group: 'edge',
      edgeMode,
      edgeLimit,
      internal: CURRENT_INTERNAL_POLICY,
      hardGap: 'current',
    });
  }
}
for (const internal of INTERNAL_CANDIDATES) {
  candidates.push({
    name: internal.name,
    group: 'internal',
    edgeMode: 'none',
    edgeLimit: 'grace',
    internal,
    hardGap: 'current',
  });
}
for (const hardGap of ['one-and-a-half', 'double'] as HardGapPolicy[]) {
  candidates.push({
    name: `hard-gap-${hardGap}`,
    group: 'hardGap',
    edgeMode: 'none',
    edgeLimit: 'grace',
    internal: CURRENT_INTERNAL_POLICY,
    hardGap,
  });
}

type CandidateSummary = {
  group: CandidateGroup;
  changes: number;
  upgrades: number;
  downgrades: number;
  edgeWarnings: number;
  tierChanges: Record<string, number>;
  dayTypes: Record<string, number>;
  gapBuckets: Record<string, number>;
  examples: Array<Record<string, unknown>>;
};

const summaries = new Map<string, CandidateSummary>(candidates.map(candidate => [candidate.name, {
  group: candidate.group,
  changes: 0,
  upgrades: 0,
  downgrades: 0,
  edgeWarnings: 0,
  tierChanges: {},
  dayTypes: {},
  gapBuckets: {},
  examples: [],
}]));

const rank = (tier: string): number => tier === 'span' ? Number.POSITIVE_INFINITY : Number(tier);
const increment = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };

const productionWindow = (raw: RawRouteDepartures): number[] => {
  const dayType = DAY_TO_TYPE[raw.day];
  const dayConfig = DEFAULT_CRITERIA.dayTypes[dayType];
  if (!dayConfig) return [];
  const { start, end } = dayConfig.timeWindow;
  let windowed = raw.departureTimes.filter(time => time >= start && time <= end);
  if (windowed.length < 2) windowed = [...raw.departureTimes].sort((a, b) => a - b);
  if (raw.railLike) {
    const midday = windowed.filter(time => time >= 570 && time <= 870);
    if (midday.length >= 2) windowed = midday;
  }
  return windowed;
};

const gapBucket = (times: number[]): string => {
  const gaps = times.length - 1;
  if (gaps < 10) return '<10 gaps';
  if (gaps < 30) return '10–29 gaps';
  if (gaps < 60) return '30–59 gaps';
  return '60+ gaps';
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

const periods: Period[] = [];
let feedsWithRows = 0;
let rawRows = 0;
let skipped = 0;
let baselineMismatches = 0;
const agencies = new Set<string>();
const routeKeys = new Set<string>();
const eligibleRouteKeys = new Set<string>();

for (let index = 0; index < allArchives.length; index++) {
  if (index % 25 === 0) console.error(`processed ${index}/${allArchives.length}`);
  const archive = allArchives[index];
  const feed = await readFeed(archive);
  if (!feed) { skipped++; continue; }
  let rawRowsForFeed: RawRouteDepartures[];
  try {
    rawRowsForFeed = computeRawDepartures(feed.data);
  } catch {
    skipped++;
    continue;
  }
  if (rawRowsForFeed.length > 0) feedsWithRows++;
  agencies.add(feed.agency);
  rawRows += rawRowsForFeed.length;
  for (const raw of rawRowsForFeed) {
    const times = productionWindow(raw);
    if (times.length < 2) continue;
    const routeKey = `${feed.agency}::${raw.route}`;
    routeKeys.add(routeKey);
    if (times.length >= 4) eligibleRouteKeys.add(routeKey);
    const dayType = DAY_TO_TYPE[raw.day];
    const dayConfig = DEFAULT_CRITERIA.dayTypes[dayType];
    if (!dayConfig) continue;
    const tiers = getTiersForCriteria(raw.routeType, dayConfig.tiers, DEFAULT_CRITERIA.modeTierOverrides);
    const gaps = times.slice(1).map((time, gapIndex) => time - times[gapIndex]);
    const currentTier = determineTier(
      gaps,
      times.length,
      times[times.length - 1] - times[0],
      tiers,
      DEFAULT_CRITERIA.graceMinutes,
      DEFAULT_CRITERIA.maxGraceViolations,
      DEFAULT_CRITERIA.gracePercent,
      DEFAULT_CRITERIA.violationPercent,
    );
    const baseline = determineCandidateTier(times, tiers, {
      edgeMode: 'none',
      edgeLimit: 'grace',
      internal: CURRENT_INTERNAL_POLICY,
      hardGap: 'current',
    }).tier;
    if (baseline !== currentTier) baselineMismatches++;
    periods.push({
      feed: feed.agency,
      route: raw.route,
      day: raw.day,
      dayType,
      dir: raw.dir,
      headsign: raw.headsign ?? '',
      shapeId: raw.shapeId ?? '',
      routeType: raw.routeType,
      mode: raw.railLike ? 'rail' : 'surface',
      times,
      tiers,
      currentTier,
      gapBucket: gapBucket(times),
    });
  }
}

for (const period of periods) {
  for (const candidate of candidates) {
    const result = determineCandidateTier(period.times, period.tiers, candidate);
    const summary = summaries.get(candidate.name)!;
    if (result.edgeWarnings.length > 0) summary.edgeWarnings += result.edgeWarnings.length;
    if (result.tier === period.currentTier) continue;
    summary.changes++;
    if (rank(result.tier) < rank(period.currentTier)) summary.upgrades++;
    else summary.downgrades++;
    increment(summary.tierChanges, `${period.currentTier}->${result.tier}`);
    increment(summary.dayTypes, period.dayType);
    increment(summary.gapBuckets, period.gapBucket);
    if (summary.examples.length < 20) {
      summary.examples.push({
        feed: period.feed,
        route: period.route,
        day: period.day,
        dir: period.dir,
        headsign: period.headsign,
        mode: period.mode,
        currentTier: period.currentTier,
        candidateTier: result.tier,
        edgeWarnings: result.edgeWarnings,
        trips: period.times.length,
      });
    }
  }
}

const output = {
  archiveCount: allArchives.length,
  feedsWithRows,
  skipped,
  rawRows,
  periods: periods.length,
  distinctAgencies: agencies.size,
  distinctRoutes: routeKeys.size,
  distinctRoutesWithEligiblePeriods: eligibleRouteKeys.size,
  baselineMismatches,
  candidates: Object.fromEntries(summaries),
};
console.log(JSON.stringify(output, null, 2));
