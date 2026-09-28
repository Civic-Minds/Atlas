#!/usr/bin/env npx tsx
/** Audit 10% of candidate transitions against the raw GTFS departure groups. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGtfsZip } from '../pipeline/parseGtfs.js';
import { normalizeGtfs } from '../pipeline/preprocess/run.js';
import { detectReferenceDate } from '../pipeline/transit-calendar.js';
import { computeRawDepartures } from '../pipeline/transit-phase1.js';
import { computePeriodSustained, computePeriodSustainedWithEdgeTransitionGap, forCrossMidnightWindow, medianHeadwayInWindow } from '../pipeline/headway-utils.js';
import { TIME_PERIODS, type PeriodKey } from '../shared/config.js';

const root = resolve(import.meta.dirname, '..');
const candidateDir = resolve(process.argv.find(arg => arg.startsWith('--candidate='))?.slice(12) ?? 'tmp/edge-transition-candidate');
const output = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'tmp/edge-transition-sample-audit.json');
const dayMap: Record<string, string> = { Weekday: 'Wednesday', Saturday: 'Saturday', Sunday: 'Sunday' };
type Agency = { slug: string; name: string; feedUrl?: string; mdbFeedUrl?: string };
type Feature = { properties?: Record<string, any> };

function processOptions(slug: string): Record<string, unknown> {
  const sourcePath = resolve(root, 'config/agencies', `${slug}.json`);
  const source = existsSync(sourcePath) ? JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown> : {};
  return {
    slug,
    force: true,
    agencyId: typeof source.agencyId === 'string' ? source.agencyId : undefined,
    preprocess: typeof source.preprocess === 'string' ? source.preprocess : undefined,
    excludeRouteShortNames: Array.isArray(source.excludeRouteShortNames) ? source.excludeRouteShortNames : undefined,
    excludeTripHeadsigns: Array.isArray(source.excludeTripHeadsigns) ? source.excludeTripHeadsigns : undefined,
    mergeEquivalentShapeVariants: source.mergeEquivalentShapeVariants === true,
  };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'User-Agent': 'atlas-edge-transition-sample-audit/1.0' }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function transitionDetails(times: number[], period: PeriodKey) {
  const config = TIME_PERIODS.find(item => item.key === period)!;
  const start = config.startHour * 60;
  const end = config.endHour * 60;
  const dt = forCrossMidnightWindow(times, end);
  const windowTimes = [...new Set(dt)].filter(time => time >= start && time <= end).sort((a, b) => a - b);
  const median = medianHeadwayInWindow(dt, start, end, 3);
  const gaps = windowTimes.slice(1).map((time, index) => time - windowTimes[index]);
  const grace = median == null ? null : Math.max(5, Math.round(median * 0.15));
  const oversized = grace == null || median == null ? [] : gaps.map((gap, index) => ({ index, gap })).filter(item => item.gap > median + grace);
  return { departureCount: windowTimes.length, median, gaps, leadingGap: windowTimes[0] == null ? null : windowTimes[0] - start, trailingGap: windowTimes.at(-1) == null ? null : end - windowTimes.at(-1), grace, oversized };
}

async function main() {
  const index = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8')) as { agencies: Agency[] };
  const manifest = JSON.parse(readFileSync(resolve(candidateDir, 'manifest.json'), 'utf8')) as { agencies: Array<{ slug: string; status: string }> };
  const agencies = new Map(index.agencies.map(agency => [agency.slug, agency]));
  const targets: Array<Record<string, any>> = [];
  for (const entry of manifest.agencies.filter(item => item.status === 'ok')) {
    const artifact = JSON.parse(readFileSync(resolve(candidateDir, `${entry.slug}.json`), 'utf8')) as { features?: Feature[] };
    for (const feature of artifact.features ?? []) {
      const p = feature.properties ?? {};
      const strict = p.headwayByPeriodSustained ?? {};
      const experimental = p.headwayByPeriodSustainedEdgeTransition ?? {};
      for (const period of Object.keys(experimental)) {
        if (strict[period] === false && experimental[period] === true) targets.push({ agency: entry.slug, routeId: p.routeId, route: p.routeShortName, direction: String(p.directionId), day: p.day, headsign: p.headsign ?? null, period, headway: p.headwayByPeriod?.[period] ?? null, maxGap: p.maxGapByPeriod?.[period] ?? null });
      }
    }
  }
  targets.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const sample = targets.filter((_, index) => index % 10 === 0).slice(0, Math.ceil(targets.length / 10));
  const byAgency = new Map<string, typeof sample>();
  for (const target of sample) byAgency.set(target.agency, [...(byAgency.get(target.agency) ?? []), target]);
  const audited: Array<Record<string, any>> = [];
  for (const [slug, agencyTargets] of byAgency) {
    const agency = agencies.get(slug)!;
    const buffer = await fetchBuffer(agency.feedUrl ?? agency.mdbFeedUrl!);
    const gtfs = normalizeGtfs(await parseGtfsZip(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer), processOptions(slug));
    const referenceDate = detectReferenceDate(gtfs.calendar ?? [], gtfs.calendarDates ?? [], gtfs.trips ?? []);
    const raw = computeRawDepartures(gtfs, referenceDate, undefined, slug);
    for (const target of agencyTargets) {
      const rawDay = dayMap[target.day] ?? target.day;
      const routeGroups = raw.filter(item => item.route === target.routeId && String(item.dir) === target.direction && item.day === rawDay);
      const exactGroups = routeGroups.filter(item => (item.headsign ?? null) === target.headsign);
      const groups = exactGroups.length > 0 ? exactGroups : routeGroups;
      const groupChecks = groups.map(group => {
        const strict = computePeriodSustained(group.departureTimes);
        const experiment = computePeriodSustainedWithEdgeTransitionGap(group.departureTimes);
        return { shapeId: group.shapeId ?? null, routeVariant: group.routeVariant ?? null, tripCount: group.tripCount, strict: strict[target.period as PeriodKey] ?? null, experiment: experiment[target.period as PeriodKey] ?? null, details: transitionDetails(group.departureTimes, target.period as PeriodKey) };
      });
      const matching = groupChecks.filter(group => group.strict === false && group.experiment === true);
      audited.push({ ...target, rawDay, matchMode: exactGroups.length > 0 ? 'exact-headsign' : 'route-direction-day-fallback', rawHeadsigns: [...new Set(routeGroups.map(item => item.headsign ?? null))], matchedGroups: groupChecks.length, matchingGroups: matching.length, applicable: matching.length > 0, groups: groupChecks });
    }
  }
  const report = { totalTransitions: targets.length, sampleCount: sample.length, sampledByDeterministicIndex: 'sorted transitions, every 10th entry', audited };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
