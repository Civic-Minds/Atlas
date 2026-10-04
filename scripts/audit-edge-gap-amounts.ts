import { readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { computeRawDepartures } from '../pipeline/transit-phase1';
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
};

type EdgeStats = {
  periods: number;
  opening: number;
  closing: number;
  both: number;
  actualOpening: number;
  actualClosing: number;
  windowOpening: number;
  windowClosing: number;
  amountCapture: Record<string, number>;
  actualAmountCapture: Record<string, number>;
  windowAmountCapture: Record<string, number>;
  excessBuckets: Record<string, number>;
  actualEdgeRatios: number[];
  actualEdgeToMedianInternalRatios: number[];
  examples: Array<Record<string, unknown>>;
};

const stats = new Map<number, EdgeStats>();
for (const tier of [5, 8, 10, 15, 20, 30, 60]) {
  stats.set(tier, {
    periods: 0,
    opening: 0,
    closing: 0,
    both: 0,
    actualOpening: 0,
    actualClosing: 0,
    windowOpening: 0,
    windowClosing: 0,
    amountCapture: Object.fromEntries(Object.keys(amountRules).map(name => [name, 0])),
    actualAmountCapture: Object.fromEntries(Object.keys(amountRules).map(name => [name, 0])),
    windowAmountCapture: Object.fromEntries(Object.keys(amountRules).map(name => [name, 0])),
    excessBuckets: {},
    actualEdgeRatios: [],
    actualEdgeToMedianInternalRatios: [],
    examples: [],
  });
}

const increment = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const quantiles = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return {
    n: sorted.length,
    p25: at(0.25),
    p50: at(0.50),
    p75: at(0.75),
    p90: at(0.90),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1],
  };
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

const getWindow = (raw: RawRouteDepartures): { times: number[]; actualOpening: boolean; actualClosing: boolean } => {
  const dayType = DAY_TO_TYPE[raw.day];
  const dayConfig = DEFAULT_CRITERIA.dayTypes[dayType];
  if (!dayConfig) return { times: [], actualOpening: false, actualClosing: false };
  let times = raw.departureTimes.filter(time => time >= dayConfig.timeWindow.start && time <= dayConfig.timeWindow.end);
  if (times.length < 2) times = [...raw.departureTimes].sort((a, b) => a - b);
  if (raw.railLike) {
    const midday = times.filter(time => time >= 570 && time <= 870);
    if (midday.length >= 2) times = midday;
  }
  if (times.length < 2) return { times: [], actualOpening: false, actualClosing: false };
  return {
    times,
    actualOpening: !raw.departureTimes.some(time => time < times[0]),
    actualClosing: !raw.departureTimes.some(time => time > times[times.length - 1]),
  };
};

let feedsWithRows = 0;
let skipped = 0;
let rawRows = 0;
let periods = 0;
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
    if (window.times.length < 4) continue;
    periods++;
    const dayType = DAY_TO_TYPE[raw.day];
    const dayConfig = DEFAULT_CRITERIA.dayTypes[dayType];
    if (!dayConfig) continue;
    const tiers = getTiersForCriteria(raw.routeType, dayConfig.tiers, DEFAULT_CRITERIA.modeTierOverrides);
    const gaps = window.times.slice(1).map((time, gapIndex) => time - window.times[gapIndex]);
    for (const tier of tiers) {
      const summary = stats.get(tier)!;
      summary.periods++;
      const grace = Math.max(5, Math.round(tier * 0.15));
      const openingGap = gaps[0];
      const closingGap = gaps[gaps.length - 1];
      const internalPasses = gaps.slice(1, -1).every(gap => gap <= tier);
      const bothEligible = openingGap > tier && closingGap > tier && internalPasses && window.times.length - 2 >= 3;
      const openingEligible = openingGap > tier && internalPasses && (closingGap <= tier || bothEligible) && window.times.length - 1 >= 3;
      const closingEligible = closingGap > tier && internalPasses && (openingGap <= tier || bothEligible) && window.times.length - 1 >= 3;
      const internalMedian = median(gaps.slice(1, -1));
      if (openingEligible) {
        summary.opening++;
        if (window.actualOpening) summary.actualOpening++;
        else summary.windowOpening++;
        if (window.actualOpening) {
          summary.actualEdgeRatios.push(openingGap / tier);
          if (internalMedian != null && internalMedian > 0) summary.actualEdgeToMedianInternalRatios.push(openingGap / internalMedian);
        }
        const excess = openingGap - tier;
        const bucket = excess <= 5 ? '1–5 minutes over' : excess <= 10 ? '6–10 minutes over' : excess <= 15 ? '11–15 minutes over' : excess <= 20 ? '16–20 minutes over' : 'more than 20 minutes over';
        increment(summary.excessBuckets, bucket);
        for (const [name, limit] of Object.entries(amountRules)) {
          if (openingGap <= limit(tier)) {
            summary.amountCapture[name]++;
            if (window.actualOpening) summary.actualAmountCapture[name]++;
            else summary.windowAmountCapture[name]++;
          }
        }
        if (summary.examples.length < 30) summary.examples.push({ feed: basename(archives[index], '.zip'), route: routeNames.get(raw.route) ?? raw.route, day: raw.day, tier, side: 'opening', gap: openingGap, actualServiceEdge: window.actualOpening, mode: raw.railLike ? 'rail' : 'surface' });
      }
      if (closingEligible) {
        summary.closing++;
        if (window.actualClosing) summary.actualClosing++;
        else summary.windowClosing++;
        if (window.actualClosing) {
          summary.actualEdgeRatios.push(closingGap / tier);
          if (internalMedian != null && internalMedian > 0) summary.actualEdgeToMedianInternalRatios.push(closingGap / internalMedian);
        }
        const excess = closingGap - tier;
        const bucket = excess <= 5 ? '1–5 minutes over' : excess <= 10 ? '6–10 minutes over' : excess <= 15 ? '11–15 minutes over' : excess <= 20 ? '16–20 minutes over' : 'more than 20 minutes over';
        increment(summary.excessBuckets, bucket);
        for (const [name, limit] of Object.entries(amountRules)) {
          if (closingGap <= limit(tier)) {
            summary.amountCapture[name]++;
            if (window.actualClosing) summary.actualAmountCapture[name]++;
            else summary.windowAmountCapture[name]++;
          }
        }
        if (summary.examples.length < 30) summary.examples.push({ feed: basename(archives[index], '.zip'), route: routeNames.get(raw.route) ?? raw.route, day: raw.day, tier, side: 'closing', gap: closingGap, actualServiceEdge: window.actualClosing, mode: raw.railLike ? 'rail' : 'surface' });
      }
      if (bothEligible) summary.both++;
    }
  }
}

const outputTiers = Object.fromEntries([...stats.entries()].map(([tier, summary]) => [tier, {
  ...summary,
  actualEdgeRatios: quantiles(summary.actualEdgeRatios),
  actualEdgeToMedianInternalRatios: quantiles(summary.actualEdgeToMedianInternalRatios),
}]));

console.log(JSON.stringify({ archiveCount: archives.length, feedsWithRows, skipped, rawRows, periods, tiers: outputTiers }, null, 2));
