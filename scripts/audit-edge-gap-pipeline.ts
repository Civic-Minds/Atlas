import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import { processGtfsBuffer, type ProcessResult } from '../pipeline/process-core';
import { parseGtfsZip } from '../pipeline/parseGtfs';
import { normalizeGtfs } from '../pipeline/preprocess/run';
import { computeRawDepartures } from '../pipeline/transit-phase1';
import { applyAnalysisCriteria, determineTier } from '../pipeline/transit-phase2';
import type { RawRouteDepartures } from '../types/gtfs';

type Feature = {
  type?: string;
  properties?: Record<string, unknown>;
};

type FeatureCollection = { type?: string; features?: Feature[] };

type ArchiveReport = {
  archive: string;
  featureCount: number;
  changedFeatures: number;
  geometryChanges: number;
  featureSetChanges: number;
  geometryExamples: Array<Record<string, unknown>>;
  propertyChanges: Record<string, number>;
  examples: Array<Record<string, unknown>>;
  invariantFailures: string[];
};

const root = '/Users/ryan/Desktop/Data/GTFS/Files';
const archives = readdirSync(root, { recursive: true })
  .filter((path): path is string => typeof path === 'string' && path.endsWith('.zip'))
  .map(path => join(root, path));

const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const outArg = process.argv.find(arg => arg.startsWith('--out='));
const archivesFileArg = process.argv.find(arg => arg.startsWith('--archives-file='));
const skipPrefilter = Boolean(archivesFileArg);
const fileArchives = archivesFileArg
  ? JSON.parse(readFileSync(resolve(archivesFileArg.slice(16)), 'utf8')) as string[]
  : null;
const selectedArchives = fileArchives ?? (limitArg ? archives.slice(0, Number(limitArg.slice(8))) : archives);
const outPath = resolve(outArg?.slice(6) ?? 'tmp/edge-gap-pipeline-diff.json');

const resultSignature = (raw: ReturnType<typeof applyAnalysisCriteria>): string => raw
  .map(item => [item.route, item.day, item.dir, item.headsign, item.shapeId, item.routeVariant, item.tier, item.serviceClass].join('|'))
  .sort()
  .join('\n');

const applyLegacyAnalysisCriteria = (rawData: RawRouteDepartures[]) => applyAnalysisCriteria(
  rawData,
  undefined,
  (headways, tripCount, spanMinutes, tiers, graceMinutes, maxGraceViolations, gracePercent, violationPercent) =>
    determineTier(headways, tripCount, spanMinutes, tiers, graceMinutes, maxGraceViolations, gracePercent, violationPercent),
);

const hasCandidateChange = async (buffer: Buffer, slug: string): Promise<boolean> => {
  try {
    const parsed = await parseGtfsZip(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const normalized = normalizeGtfs(parsed, { slug });
    const raw = computeRawDepartures(normalized, undefined, undefined, slug);
    return resultSignature(applyLegacyAnalysisCriteria(raw)) !== resultSignature(applyAnalysisCriteria(raw));
  } catch {
    return true;
  }
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
};

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const comparableStopsMeta = (value: string): unknown => {
  const parsed = parseJson<Record<string, unknown>>(value);
  return { ...parsed, generatedAt: null };
};

const featureKey = (feature: Feature): string => {
  const p = feature.properties ?? {};
  return [p.routeId, p.routeShortName, p.directionId, p.day, p.headsign, p.routeVariant]
    .map(value => String(value ?? ''))
    .join('|');
};

const compareResults = (baseline: ProcessResult, candidate: ProcessResult, archive: string): ArchiveReport => {
  const baselineGeo = parseJson<FeatureCollection>(baseline.geojson);
  const candidateGeo = parseJson<FeatureCollection>(candidate.geojson);
  const baselineFeatures = new Map((baselineGeo.features ?? []).map(feature => [featureKey(feature), feature]));
  const candidateFeatures = new Map((candidateGeo.features ?? []).map(feature => [featureKey(feature), feature]));
  const propertyChanges: Record<string, number> = {};
  const examples: Array<Record<string, unknown>> = [];
  const invariantFailures: string[] = [];
  let changedFeatures = 0;
  let geometryChanges = 0;
  let featureSetChanges = 0;
  const geometryExamples: Array<Record<string, unknown>> = [];

  const keys = new Set([...baselineFeatures.keys(), ...candidateFeatures.keys()]);
  for (const key of keys) {
    const before = baselineFeatures.get(key);
    const after = candidateFeatures.get(key);
    if (!before || !after) {
      featureSetChanges++;
      invariantFailures.push(`route feature set changed: ${key}`);
      continue;
    }
    if (stableStringify(before.geometry) !== stableStringify(after.geometry)) {
      geometryChanges++;
      if (geometryExamples.length < 10) {
        geometryExamples.push({
          key,
          beforeCoordinateCount: Array.isArray((before.geometry as { coordinates?: unknown[] })?.coordinates)
            ? (before.geometry as { coordinates: unknown[] }).coordinates.length : null,
          afterCoordinateCount: Array.isArray((after.geometry as { coordinates?: unknown[] })?.coordinates)
            ? (after.geometry as { coordinates: unknown[] }).coordinates.length : null,
        });
      }
    }
    const beforeProps = before.properties ?? {};
    const afterProps = after.properties ?? {};
    const changedKeys = [...new Set([...Object.keys(beforeProps), ...Object.keys(afterProps)])]
      .filter(property => stableStringify(beforeProps[property]) !== stableStringify(afterProps[property]));
    if (changedKeys.length === 0) continue;
    changedFeatures++;
    for (const property of changedKeys) propertyChanges[property] = (propertyChanges[property] ?? 0) + 1;
    if (examples.length < 20) {
      examples.push({
        key,
        changedKeys,
        before: Object.fromEntries(changedKeys.map(property => [property, beforeProps[property]])),
        after: Object.fromEntries(changedKeys.map(property => [property, afterProps[property]])),
      });
    }
  }

  if (baseline.featureCount !== candidate.featureCount) invariantFailures.push(`featureCount ${baseline.featureCount} -> ${candidate.featureCount}`);
  if (stableStringify(parseJson(baseline.corridorsGeojson)) !== stableStringify(parseJson(candidate.corridorsGeojson))) invariantFailures.push('corridorsGeojson changed');
  if (stableStringify(parseJson(baseline.stopsJson)) !== stableStringify(parseJson(candidate.stopsJson))) invariantFailures.push('stopsJson changed');
  if (stableStringify(parseJson(baseline.tripsJson)) !== stableStringify(parseJson(candidate.tripsJson))) invariantFailures.push('tripsJson changed');
  if (stableStringify(comparableStopsMeta(baseline.stopsMetaJson)) !== stableStringify(comparableStopsMeta(candidate.stopsMetaJson))) invariantFailures.push('stopsMetaJson changed');
  if (stableStringify(baseline.center) !== stableStringify(candidate.center)) invariantFailures.push('center changed');
  if (baseline.timezone !== candidate.timezone) invariantFailures.push(`timezone ${baseline.timezone} -> ${candidate.timezone}`);
  if (baseline.feedExpiry !== candidate.feedExpiry) invariantFailures.push(`feedExpiry ${baseline.feedExpiry} -> ${candidate.feedExpiry}`);
  if (baseline.feedVersion !== candidate.feedVersion) invariantFailures.push(`feedVersion ${baseline.feedVersion} -> ${candidate.feedVersion}`);

  return { archive, featureCount: baseline.featureCount, changedFeatures, geometryChanges, featureSetChanges, geometryExamples, propertyChanges, examples, invariantFailures };
};

const reports: ArchiveReport[] = [];
const errors: Array<{ archive: string; error: string }> = [];
for (let index = 0; index < selectedArchives.length; index++) {
  if (index % 10 === 0) console.error(`processed ${index}/${selectedArchives.length}`);
  const archive = selectedArchives[index];
  try {
    const buffer = readFileSync(archive);
    const slug = basename(archive, '.zip');
    if (!skipPrefilter && !await hasCandidateChange(buffer, slug)) continue;
    const options = { slug, force: true as const };
    const baseline = await processGtfsBuffer(buffer, undefined, {
      ...options,
      analysisCriteriaFn: applyLegacyAnalysisCriteria,
    });
    const candidate = await processGtfsBuffer(buffer, undefined, options);
    reports.push(compareResults(baseline, candidate, archive));
  } catch (error) {
    errors.push({ archive, error: error instanceof Error ? error.message : String(error) });
  }
}

const output = {
  archiveCount: selectedArchives.length,
  completed: reports.length,
  errors,
  changedArchives: reports.filter(report => report.changedFeatures > 0).length,
  changedFeatures: reports.reduce((sum, report) => sum + report.changedFeatures, 0),
  geometryChanges: reports.reduce((sum, report) => sum + report.geometryChanges, 0),
  featureSetChanges: reports.reduce((sum, report) => sum + report.featureSetChanges, 0),
  propertyChanges: reports.reduce<Record<string, number>>((all, report) => {
    for (const [property, count] of Object.entries(report.propertyChanges)) all[property] = (all[property] ?? 0) + count;
    return all;
  }, {}),
  invariantFailures: reports.reduce((sum, report) => sum + report.invariantFailures.length, 0),
  reports: reports.filter(report => report.changedFeatures > 0 || report.invariantFailures.length > 0),
};

mkdirSync(resolve(outPath, '..'), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  archiveCount: output.archiveCount,
  completed: output.completed,
  errors: output.errors.length,
  changedArchives: output.changedArchives,
  changedFeatures: output.changedFeatures,
  geometryChanges: output.geometryChanges,
  featureSetChanges: output.featureSetChanges,
  propertyChanges: output.propertyChanges,
  invariantFailures: output.invariantFailures,
  outPath,
}, null, 2));
