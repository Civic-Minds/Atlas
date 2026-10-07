import { readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { computeRawDepartures } from '../pipeline/transit-phase1';
import { determineTier } from '../pipeline/transit-phase2';
import { DEFAULT_CRITERIA, getTiersForCriteria } from '../pipeline/defaults';
import { DAY_TO_TYPE, GtfsData, RawRouteDepartures } from '../types/gtfs';

const parse = (text: string) => Papa.parse(text, {
  header: true,
  skipEmptyLines: true,
  transform: (value: string) => value.trim(),
}).data as any[];

const archives = readdirSync('/Users/ryan/Desktop/Data/GTFS/Files', { recursive: true })
  .filter((path): path is string => typeof path === 'string' && path.endsWith('.zip'))
  .map(path => join('/Users/ryan/Desktop/Data/GTFS/Files', path));

const amountRules: Record<string, (tier: number) => number> = {
  '+5 minutes': tier => tier + 5,
  '+10 minutes': tier => tier + 10,
  '+15 minutes': tier => tier + 15,
  '+20 minutes': tier => tier + 20,
  '+10%': tier => tier * 1.10,
  '+15%': tier => tier * 1.15,
  '+20%': tier => tier * 1.20,
  '+25%': tier => tier * 1.25,
  '+50%': tier => tier * 1.50,
  'current max(5, 15%)': tier => tier + Math.max(5, Math.round(tier * 0.15)),
  '+5% beyond normal grace': tier => tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.05,
  '+10% beyond normal grace': tier => tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.10,
  '+15% beyond normal grace': tier => tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.15,
  '+20% beyond normal grace': tier => tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.20,
  '+25% beyond normal grace': tier => tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.25,
  'dynamic floor-5% booster, max tier+10': tier => Math.min(
    tier + 10,
    tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + Math.max(5, Math.round(tier * 0.10)),
  ),
  'dynamic 10% booster, max tier+10': tier => Math.min(
    tier + 10,
    tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + Math.round(tier * 0.10),
  ),
  'dynamic 15% booster, max tier+10': tier => Math.min(
    tier + 10,
    tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + Math.round(tier * 0.15),
  ),
  'dynamic 20% booster, max tier+10': tier => Math.min(
    tier + 10,
    tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + Math.round(tier * 0.20),
  ),
  '+10% beyond normal grace, max tier+10': tier => Math.min(tier + 10, tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.10),
  '+15% beyond normal grace, max tier+10': tier => Math.min(tier + 10, tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.15),
  '+20% beyond normal grace, max tier+10': tier => Math.min(tier + 10, tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.20),
  '+25% beyond normal grace, max tier+10': tier => Math.min(tier + 10, tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.25),
  '+20% beyond normal grace, max tier+15': tier => Math.min(tier + 15, tier + Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent)) + tier * 0.20),
};
const impactAmounts = [
  '+10 minutes', '+15 minutes', '+20 minutes', '+10%', '+15%', 'current max(5, 15%)',
  '+5% beyond normal grace', '+10% beyond normal grace', '+15% beyond normal grace',
  '+20% beyond normal grace', '+25% beyond normal grace',
  'dynamic floor-5% booster, max tier+10', 'dynamic 10% booster, max tier+10',
  'dynamic 15% booster, max tier+10', 'dynamic 20% booster, max tier+10',
  '+10% beyond normal grace, max tier+10', '+15% beyond normal grace, max tier+10',
  '+20% beyond normal grace, max tier+10', '+25% beyond normal grace, max tier+10',
  '+20% beyond normal grace, max tier+15',
];
const proposalOnly = process.argv.includes('--proposal-only');
const dynamicOnly = process.argv.includes('--dynamic-only');
const sampleOnly = process.argv.includes('--sample-only');
const edgeCountOnly = process.argv.includes('--edge-count-only');
const impactTreatments: EdgeTreatment[] = edgeCountOnly
  ? ['trim-both', 'trim-both-count-edge']
  : sampleOnly ? ['trim-both', 'one-total']
  : proposalOnly ? ['one-total'] : ['trim-both', 'one-total', 'preserve-frame'];
const amountsToRun = sampleOnly
  ? edgeCountOnly ? ['+10 minutes'] : ['+10 minutes', 'dynamic 10% booster, max tier+10']
  : edgeCountOnly ? ['+10 minutes']
  : dynamicOnly
  ? ['dynamic floor-5% booster, max tier+10']
  : proposalOnly ? ['+10 minutes'] : impactAmounts;

type EdgeMode = 'opening' | 'closing' | 'both';
type EdgeTreatment = 'trim-both' | 'trim-both-count-edge' | 'one-total' | 'preserve-frame';
type EdgeResult = {
  changes: number;
  upgrades: number;
  downgrades: number;
  candidates: number;
  tierChanges: Record<string, number>;
  examples: Array<Record<string, unknown>>;
};

const makeResult = (): EdgeResult => ({ changes: 0, upgrades: 0, downgrades: 0, candidates: 0, tierChanges: {}, examples: [] });
const rank = (tier: string): number => tier === 'span' ? Number.POSITIVE_INFINITY : Number(tier);
const increment = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };

const qualifiesAtTier = (times: number[], tier: number, frame = times, extraExceptionCount = 0): boolean => {
  if (times.length < 2) return false;
  const gaps = times.slice(1).map((time, index) => time - times[index]);
  if (frame.length < Math.ceil((frame[frame.length - 1] - frame[0]) / tier)) return false;
  const grace = Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent));
  // The count-included variant treats each qualifying edge booster as one
  // exception in the same allowance, while retaining the same percentage and
  // cap logic used for the interior gaps.
  const allowanceGapCount = gaps.length + extraExceptionCount;
  const allowedViolations = Math.max(DEFAULT_CRITERIA.maxGraceViolations, Math.floor(allowanceGapCount * DEFAULT_CRITERIA.violationPercent));
  let violations = extraExceptionCount;
  for (const gap of gaps) {
    if (gap <= tier) continue;
    if (gap > tier + grace || ++violations > allowedViolations) return false;
  }
  return true;
};

const candidateTierFor = (
  times: number[],
  tiers: number[],
  actualOpening: boolean,
  actualClosing: boolean,
  mode: EdgeMode,
  limitFor: (tier: number) => number,
  treatment: EdgeTreatment,
): { tier: string; edgeUsed: boolean } => {
  for (const tier of tiers) {
    const gaps = times.slice(1).map((time, index) => time - times[index]);
    const existingGrace = Math.max(DEFAULT_CRITERIA.graceMinutes, Math.round(tier * DEFAULT_CRITERIA.gracePercent));
    const opening = (mode === 'opening' || mode === 'both') && actualOpening && gaps[0] > tier + existingGrace && gaps[0] <= limitFor(tier);
    const closing = (mode === 'closing' || mode === 'both') && actualClosing && gaps[gaps.length - 1] > tier + existingGrace && gaps[gaps.length - 1] <= limitFor(tier);
    const variants = treatment === 'one-total' && mode === 'both' && opening && closing
      ? [{ opening: true, closing: false }, { opening: false, closing: true }]
      : [{ opening, closing }];
    for (const variant of variants) {
      const trims = Number(variant.opening) + Number(variant.closing);
      if (trims && times.length - trims < 4) continue;
      const trimmed = times.slice(variant.opening ? 1 : 0, variant.closing ? -1 : undefined);
      const frame = treatment === 'preserve-frame' ? times : trimmed;
      const edgeExceptionCount = treatment === 'trim-both-count-edge' ? trims : 0;
      if (qualifiesAtTier(trimmed, tier, frame, edgeExceptionCount)) {
        return { tier: String(tier), edgeUsed: Boolean(trims) };
      }
    }
  }
  return { tier: 'span', edgeUsed: false };
};

const readFeed = async (archive: string): Promise<GtfsData | null> => {
  try {
    const zip = await JSZip.loadAsync(readFileSync(archive));
    const get = async (name: string) => {
      const file = zip.file(name);
      return file ? parse(await file.async('text')) : [];
    };
    return {
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
  } catch {
    return null;
  }
};

const getWindow = (raw: RawRouteDepartures) => {
  const dayType = DAY_TO_TYPE[raw.day];
  const dayConfig = DEFAULT_CRITERIA.dayTypes[dayType];
  if (!dayConfig) return null;
  let times = raw.departureTimes.filter(time => time >= dayConfig.timeWindow.start && time <= dayConfig.timeWindow.end);
  if (times.length < 2) times = [...raw.departureTimes].sort((a, b) => a - b);
  if (raw.railLike) {
    const midday = times.filter(time => time >= 570 && time <= 870);
    if (midday.length >= 2) times = midday;
  }
  if (times.length < 4) return null;
  return {
    times,
    actualOpening: !raw.departureTimes.some(time => time < times[0]),
    actualClosing: !raw.departureTimes.some(time => time > times[times.length - 1]),
  };
};

const results = new Map<string, EdgeResult>();
for (const treatment of impactTreatments) {
  for (const amount of amountsToRun) {
    for (const mode of ['opening', 'closing', 'both'] as EdgeMode[]) {
      results.set(`${treatment}: ${mode}: ${amount}`, makeResult());
    }
  }
}

let feedsWithRows = 0;
let skipped = 0;
let rawRows = 0;
let periods = 0;
let baselineMismatches = 0;
const proposalAffectedArchives = new Set<string>();

for (let index = 0; index < archives.length; index++) {
  if (index % 25 === 0) console.error(`processed ${index}/${archives.length}`);
  const data = await readFeed(archives[index]);
  if (!data) { skipped++; continue; }
  let rawRowsForFeed: RawRouteDepartures[];
  try {
    rawRowsForFeed = computeRawDepartures(data);
  } catch {
    skipped++;
    continue;
  }
  if (rawRowsForFeed.length) feedsWithRows++;
  rawRows += rawRowsForFeed.length;
  const routeNames = new Map((data.routes ?? []).map((route: any) => [route.route_id, route.route_short_name || route.route_id]));
  for (const raw of rawRowsForFeed) {
    const window = getWindow(raw);
    if (!window) continue;
    periods++;
    const dayType = DAY_TO_TYPE[raw.day];
    const dayConfig = DEFAULT_CRITERIA.dayTypes[dayType];
    if (!dayConfig) continue;
    const tiers = getTiersForCriteria(raw.routeType, dayConfig.tiers, DEFAULT_CRITERIA.modeTierOverrides);
    const gaps = window.times.slice(1).map((time, gapIndex) => time - window.times[gapIndex]);
    const currentTier = determineTier(
      gaps,
      window.times.length,
      window.times[window.times.length - 1] - window.times[0],
      tiers,
      DEFAULT_CRITERIA.graceMinutes,
      DEFAULT_CRITERIA.maxGraceViolations,
      DEFAULT_CRITERIA.gracePercent,
      DEFAULT_CRITERIA.violationPercent,
    );
    if (currentTier !== determineTier(
      gaps,
      window.times.length,
      window.times[window.times.length - 1] - window.times[0],
      tiers,
      DEFAULT_CRITERIA.graceMinutes,
      DEFAULT_CRITERIA.maxGraceViolations,
      DEFAULT_CRITERIA.gracePercent,
      DEFAULT_CRITERIA.violationPercent,
    )) baselineMismatches++;

    for (const treatment of impactTreatments) {
      for (const amount of amountsToRun) {
        const limitFor = amountRules[amount];
        for (const mode of ['opening', 'closing', 'both'] as EdgeMode[]) {
          const result = results.get(`${treatment}: ${mode}: ${amount}`)!;
          const candidate = candidateTierFor(window.times, tiers, window.actualOpening, window.actualClosing, mode, limitFor, treatment);
          if (treatment === 'one-total' && mode === 'both' && amount === '+10 minutes' && candidate.tier !== currentTier) {
            proposalAffectedArchives.add(archives[index]);
          }
          if (candidate.edgeUsed) result.candidates++;
          if (candidate.tier === currentTier) continue;
          result.changes++;
          if (rank(candidate.tier) < rank(currentTier)) result.upgrades++;
          else result.downgrades++;
          increment(result.tierChanges, `${currentTier}->${candidate.tier}`);
          if (sampleOnly && candidate.edgeUsed && result.examples.length < 40) {
            const internalGaps = gaps.slice(1, -1).sort((a, b) => a - b);
            const tripBucket = window.times.length <= 4 ? '3-4' : window.times.length <= 6 ? '5-6' : window.times.length <= 10 ? '7-10' : '11+';
            const sampleKey = `${candidate.tier}|${raw.railLike ? 'rail' : 'surface'}|${tripBucket}|${mode}`;
            if (result.examples.filter(example => example.sampleKey === sampleKey).length >= 2) continue;
            result.examples.push({
              sampleKey,
              feed: basename(archives[index], '.zip'),
              route: routeNames.get(raw.route) ?? raw.route,
              day: raw.day,
              direction: raw.dir,
              mode: raw.railLike ? 'rail' : 'surface',
              tripCount: window.times.length,
              currentTier,
              candidateTier: candidate.tier,
              edgeMode: mode,
              edgeTreatment: treatment,
              openingGap: gaps[0],
              closingGap: gaps[gaps.length - 1],
              internalGapCount: internalGaps.length,
              internalMin: internalGaps[0] ?? null,
              internalMax: internalGaps.at(-1) ?? null,
              internalMedian: internalGaps.length ? internalGaps[Math.floor(internalGaps.length / 2)] : null,
              actualOpening: window.actualOpening,
              actualClosing: window.actualClosing,
            });
          }
        }
      }
    }
  }
}

console.log(JSON.stringify({
  archiveCount: archives.length,
  feedsWithRows,
  skipped,
  rawRows,
  periods,
  baselineMismatches,
  proposalAffectedArchives: [...proposalAffectedArchives].sort(),
  results: Object.fromEntries(results),
}, null, 2));
