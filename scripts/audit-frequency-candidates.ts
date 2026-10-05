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
  InternalPolicy,
  EdgeLimit,
  EdgeMode,
  HardGapPolicy,
  determineCandidateTier,
} from './frequency-candidate-rules';

type CandidateGroup = 'edge' | 'internal' | 'hardGap' | 'minimumEvidence' | 'q2Internal';
type Candidate = CandidateRuleOptions & { name: string; group: CandidateGroup; targetTier?: number };
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

// Q2 study candidates. These compare tier-specific percentage allowances against
// a strict zero-exception reference. The current 30% rule is intentionally not
// used as the reference or treated as a recommendation.
const q2Tiers = [5, 8, 10, 15, 20, 30, 60];
const q2Percentages = [0.05, 0.10, 0.15, 0.20, 0.25];
const q2Floors = [0, 1];
const q2Caps: Array<number | undefined> = [undefined, 3, 5];
const q2PolicyName = (percent: number, floor: number, cap: number | undefined): string =>
  `p${Math.round(percent * 100)}-floor${floor}-cap${cap ?? 'none'}`;
for (const targetTier of q2Tiers) {
  for (const percent of q2Percentages) {
    for (const minimum of q2Floors) {
      for (const maximum of q2Caps) {
        const policyName = q2PolicyName(percent, minimum, maximum);
        candidates.push({
          name: `q2-tier-${targetTier}-${policyName}`,
          group: 'q2Internal',
          targetTier,
          edgeMode: 'none',
          edgeLimit: 'grace',
          internal: {
            name: `q2-tier-${targetTier}-${policyName}`,
            percent: 0,
            percentByTier: { [targetTier]: percent },
            minimum,
            maximum,
          },
          hardGap: 'current',
          minimumEvidence: 3,
        });
      }
    }
  }
}

const q2Curves: Record<string, Record<number, number>> = {
  'curve-20-15-10-5-5': { 5: 0.20, 8: 0.20, 10: 0.20, 15: 0.15, 20: 0.10, 30: 0.05, 60: 0.05 },
  'curve-15-10-10-5-5': { 5: 0.15, 8: 0.15, 10: 0.15, 15: 0.10, 20: 0.10, 30: 0.05, 60: 0.05 },
  'curve-10-10-5-5-5': { 5: 0.10, 8: 0.10, 10: 0.10, 15: 0.10, 20: 0.05, 30: 0.05, 60: 0.05 },
};
for (const [curveName, percentByTier] of Object.entries(q2Curves)) {
  for (const minimum of q2Floors) {
    for (const maximum of q2Caps) {
      const policyName = `${curveName}-floor${minimum}-cap${maximum ?? 'none'}`;
      candidates.push({
        name: `q2-${policyName}`,
        group: 'q2Internal',
        edgeMode: 'none',
        edgeLimit: 'grace',
        internal: {
          name: `q2-${policyName}`,
          percent: 0,
          percentByTier,
          minimum,
          maximum,
        },
        hardGap: 'current',
        minimumEvidence: 3,
      });
    }
  }
}
for (const hardGap of ['one-and-a-quarter', 'one-and-a-half', 'one-and-three-quarters', 'double'] as HardGapPolicy[]) {
  candidates.push({
    name: `hard-gap-${hardGap}`,
    group: 'hardGap',
    edgeMode: 'none',
    edgeLimit: 'grace',
    internal: CURRENT_INTERNAL_POLICY,
    hardGap,
  });
}

const q3InternalPolicies = [
  { name: 'fixed-2', percent: 0, minimum: 2, maximum: 2 },
  { name: 'percent-30-cap-3', percent: 0.30, minimum: 2, maximum: 3 },
];
for (const internal of q3InternalPolicies) {
  for (const hardGap of ['current', 'one-and-a-quarter', 'one-and-a-half', 'one-and-three-quarters', 'double'] as HardGapPolicy[]) {
    candidates.push({
      name: `q3-${internal.name}-${hardGap}`,
      group: 'hardGap',
      edgeMode: 'none',
      edgeLimit: 'grace',
      internal,
      hardGap,
    });
  }
}

for (const minimumEvidence of [2, 3, 4, 5, 6]) {
  candidates.push({
    name: `q4-minimum-evidence-${minimumEvidence}`,
    group: 'minimumEvidence',
    edgeMode: 'none',
    edgeLimit: 'grace',
    internal: CURRENT_INTERNAL_POLICY,
    hardGap: 'current',
    minimumEvidence,
  });
}

const reviewOnlyCandidateName = 'q2-curve-10-10-5-5-5-floor0-cap3';
const reviewOnly = process.env.Q2_REVIEW_ONLY === '1';
const candidatesToRun = process.env.Q2_REVIEW_ONLY === '1'
  ? candidates.filter(candidate => candidate.name === reviewOnlyCandidateName)
  : candidates;

type CandidateSummary = {
  group: CandidateGroup;
  targetTier?: number;
  changes: number;
  upgrades: number;
  downgrades: number;
  edgeWarnings: number;
  tierChanges: Record<string, number>;
  dayTypes: Record<string, number>;
  gapBuckets: Record<string, number>;
  tripCounts: Record<string, number>;
  examples: Array<Record<string, unknown>>;
  reviewExamples: Record<string, Array<Record<string, unknown>>>;
};

const summaries = new Map<string, CandidateSummary>(candidatesToRun.map(candidate => [candidate.name, {
  group: candidate.group,
  targetTier: candidate.targetTier,
  changes: 0,
  upgrades: 0,
  downgrades: 0,
  edgeWarnings: 0,
  tierChanges: {},
  dayTypes: {},
  gapBuckets: {},
  tripCounts: {},
  examples: [],
  reviewExamples: {},
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
const q2StrictReference: InternalPolicy = { name: 'q2-strict-zero-exceptions', percent: 0, minimum: 0, maximum: 0 };

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
  const q2StrictTier = determineCandidateTier(period.times, period.tiers, {
    edgeMode: 'none',
    edgeLimit: 'grace',
    internal: q2StrictReference,
    hardGap: 'current',
    minimumEvidence: 3,
  }).tier;
  for (const candidate of candidatesToRun) {
    // Keep Q3 separate from the unresolved short-period question (Q4). The
    // Q3 comparison uses periods with at least four selected departures.
    if (candidate.name.startsWith('q3-') && period.times.length < 4) continue;
    let result = determineCandidateTier(period.times, period.tiers, candidate);
    // Independent Q2 candidates only change one tier's allowance. If the
    // strict reference already qualifies at a faster tier, the candidate
    // cannot change the result. Otherwise, test only the target tier and fall
    // back to the strict result if it does not qualify. This preserves the
    // tier-ordering semantics while avoiding hundreds of repeated evaluations.
    if (candidate.group === 'q2Internal' && candidate.targetTier !== undefined) {
      if (rank(q2StrictTier) < candidate.targetTier || !period.tiers.includes(candidate.targetTier)) {
        result = { tier: q2StrictTier, edgeWarnings: [] };
      } else {
        const targetResult = determineCandidateTier(period.times, [candidate.targetTier], candidate);
        result = targetResult.tier === String(candidate.targetTier)
          ? targetResult
          : { tier: q2StrictTier, edgeWarnings: [] };
      }
    }
    const comparisonTier = candidate.name.startsWith('q3-')
      ? determineCandidateTier(period.times, period.tiers, { ...candidate, hardGap: 'current' }).tier
      : candidate.group === 'minimumEvidence'
      ? determineCandidateTier(period.times, period.tiers, { ...candidate, minimumEvidence: 3 }).tier
      : candidate.group === 'q2Internal'
      ? q2StrictTier
      : period.currentTier;
    const summary = summaries.get(candidate.name)!;
    if (result.edgeWarnings.length > 0) summary.edgeWarnings += result.edgeWarnings.length;
    if (result.tier === comparisonTier) continue;
    summary.changes++;
    if (rank(result.tier) < rank(comparisonTier)) summary.upgrades++;
    else summary.downgrades++;
    increment(summary.tierChanges, `${comparisonTier}->${result.tier}`);
    increment(summary.dayTypes, period.dayType);
    increment(summary.gapBuckets, period.gapBucket);
    increment(summary.tripCounts, period.times.length <= 6 ? String(period.times.length) : '7+');
    if (summary.examples.length < 20) {
      summary.examples.push({
        feed: period.feed,
        route: period.route,
        day: period.day,
        dir: period.dir,
        headsign: period.headsign,
        mode: period.mode,
        currentTier: comparisonTier,
        candidateTier: result.tier,
        edgeWarnings: result.edgeWarnings,
        trips: period.times.length,
        gaps: period.times.slice(1).map((time, index) => time - period.times[index]),
      });
    }
    if (reviewOnly && candidate.name === reviewOnlyCandidateName && ['10', '20', '30', '60'].includes(result.tier)) {
      const tripBucket = period.times.length <= 6 ? `${period.times.length} trips` : period.times.length <= 12 ? '7–12 trips' : '13+ trips';
      const sampleKey = `${result.tier}:${period.mode}:${period.dayType}:${tripBucket}`;
      const reviewExamples = summary.reviewExamples[result.tier] ?? (summary.reviewExamples[result.tier] = []);
      const sameStratumCount = reviewExamples.filter(example => example.sampleKey === sampleKey).length;
      if (reviewExamples.length < 10 && sameStratumCount < 4) {
        const tier = Number(result.tier);
        const grace = Math.max(5, Math.round(tier * 0.15));
        const nearMisses = period.times.slice(1)
          .map((time, index) => time - period.times[index])
          .filter(gap => gap > tier && gap <= tier + grace);
        reviewExamples.push({
          sampleKey,
          feed: period.feed,
          route: period.route,
          day: period.day,
          dayType: period.dayType,
          dir: period.dir,
          headsign: period.headsign,
          mode: period.mode,
          strictTier: comparisonTier,
          candidateTier: result.tier,
          trips: period.times.length,
          gapCount: period.times.length - 1,
          nearMissCount: nearMisses.length,
          longestGap: Math.max(...period.times.slice(1).map((time, index) => time - period.times[index])),
          gaps: period.times.slice(1).map((time, index) => time - period.times[index]),
        });
      }
    }
  }
}

const output = {
  archiveCount: allArchives.length,
  feedsWithRows,
  skipped,
  rawRows,
  periods: periods.length,
  q3EligiblePeriods: periods.filter(period => period.times.length >= 4).length,
  q4EligiblePeriods: periods.filter(period => period.times.length >= 2).length,
  q2EligiblePeriods: periods.filter(period => period.times.length >= 3).length,
  q2Reference: 'strict zero internal exceptions, current gap-size grace, current hard-gap boundary, minimum 3 departures',
  distinctAgencies: agencies.size,
  distinctRoutes: routeKeys.size,
  distinctRoutesWithEligiblePeriods: eligibleRouteKeys.size,
  baselineMismatches,
  candidates: Object.fromEntries(summaries),
};
console.log(JSON.stringify(output, null, 2));
