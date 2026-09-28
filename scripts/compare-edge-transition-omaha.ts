#!/usr/bin/env npx tsx
/**
 * Read-only Omaha ORBT comparison for the fixed-period edge-transition experiment.
 * This reads the current public Atlas artifact and the configured GTFS feed, then writes
 * a local comparison report. It never writes R2 or changes the agency registry.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGtfsZip } from '../pipeline/parseGtfs.js';
import { detectReferenceDate } from '../pipeline/transit-calendar.js';
import { computeRawDepartures } from '../pipeline/transit-phase1.js';
import { computePeriodSustained, computePeriodSustainedWithEdgeTransitionGap } from '../pipeline/headway-utils.js';
import { TIME_PERIODS, type PeriodKey } from '../shared/config.js';

type Feature = { properties?: Record<string, any> };
type Artifact = { features?: Feature[] };

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'tmp/edge-transition-omaha-2026-09.json');
const agency = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8'))
  .agencies.find((item: { slug: string }) => item.slug === 'omahametro') as { feedUrl: string; lastFeedVersion?: string };
const artifactUrl = 'https://data.transitatlas.fyi/atlas/omahametro.json';

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'User-Agent': 'atlas-edge-transition-experiment/1.0' } });
  if (!response.ok) throw new Error(`Feed request failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const [feedBuffer, artifactResponse] = await Promise.all([
    fetchBuffer(agency.feedUrl),
    fetch(artifactUrl),
  ]);
  if (!artifactResponse.ok) throw new Error(`Atlas artifact request failed: HTTP ${artifactResponse.status}`);
  const artifact = await artifactResponse.json() as Artifact;
  const gtfs = await parseGtfsZip(feedBuffer.buffer.slice(feedBuffer.byteOffset, feedBuffer.byteOffset + feedBuffer.byteLength) as ArrayBuffer);
  const referenceDate = detectReferenceDate(gtfs.calendar ?? [], gtfs.calendarDates ?? [], gtfs.trips ?? []);
  const orbtRouteId = (gtfs.routes ?? []).find(route => route.route_short_name === '00')?.route_id;
  const raw = computeRawDepartures(gtfs, referenceDate)
    .filter(item => item.day === 'Wednesday' && item.route === orbtRouteId);
  const published = (artifact.features ?? []).filter(feature => feature.properties?.routeShortName === '00' && feature.properties?.day === 'Weekday');
  const directions = [...new Set(raw.map(item => item.dir))].sort();
  const periods = Object.fromEntries(TIME_PERIODS.map(period => [period.key, null])) as Record<PeriodKey, null>;
  const rows = directions.map(directionId => {
    const times = raw.filter(item => item.dir === directionId).flatMap(item => item.departureTimes);
    const strict = computePeriodSustained(times);
    const tolerant = computePeriodSustainedWithEdgeTransitionGap(times);
    const artifactRow = published.find(feature => String(feature.properties?.directionId) === String(directionId))?.properties ?? null;
    return {
      directionId,
      departureCount: times.length,
      strict,
      edgeTransitionExperiment: tolerant,
      changedPeriods: Object.keys(periods).filter(key => strict[key as PeriodKey] !== tolerant[key as PeriodKey]),
      publishedR2: artifactRow ? {
        headwayByPeriod: artifactRow.headwayByPeriod ?? null,
        headwayByPeriodSustained: artifactRow.headwayByPeriodSustained ?? null,
        maxGapByPeriod: artifactRow.maxGapByPeriod ?? null,
        tier: artifactRow.tier ?? null,
      } : null,
    };
  });

  mkdirSync(resolve(root, 'tmp'), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), agency: 'Omaha Metro', route: '00 ORBT', feedVersion: agency.lastFeedVersion ?? null, referenceDate, source: { feedUrl: agency.feedUrl, artifactUrl }, rows }, null, 2)}\n`);
  console.log(`Wrote ${output}`);
  for (const row of rows) console.log(`direction ${row.directionId}: strict=${JSON.stringify(row.strict)} experiment=${JSON.stringify(row.edgeTransitionExperiment)} changed=${row.changedPeriods.join(',') || 'none'}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
