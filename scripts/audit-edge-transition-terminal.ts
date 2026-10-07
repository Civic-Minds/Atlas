#!/usr/bin/env npx tsx
/** Audit every candidate transition using the pipeline's exact terminal/shape source. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { processGtfsBuffer, type EdgeTransitionAuditRecord, type ProcessOptions } from '../pipeline/process-core.js';
import { computePeriodSustainedWithEdgeTransitionGap, forCrossMidnightWindow, medianHeadwayInWindow } from '../pipeline/headway-utils.js';
import { TIME_PERIODS, type PeriodKey } from '../shared/config.js';

const root = resolve(import.meta.dirname, '..');
const candidateDir = resolve(process.argv.find(arg => arg.startsWith('--candidate='))?.slice(12) ?? 'tmp/edge-transition-candidate');
const auditDirArg = process.argv.find(arg => arg.startsWith('--audit-dir='))?.slice(12);
const auditDir = auditDirArg ? resolve(auditDirArg) : null;
const output = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'tmp/edge-transition-terminal-audit.json');

type Agency = { slug: string; name: string; feedUrl?: string | null; mdbFeedUrl?: string | null };
type Feature = { properties?: Record<string, any> };
type Candidate = {
  agency: string;
  routeId: string;
  routeShortName: string;
  directionId: number;
  day: string;
  headsign: string | null;
  routeVariant: string | null;
  period: PeriodKey;
  headway: number | null;
  maxGap: number | null;
};

function featureKey(value: Pick<Candidate, 'agency' | 'routeId' | 'directionId' | 'day' | 'headsign' | 'routeVariant' | 'period'>): string {
  return [value.agency, value.routeId, value.directionId, value.day, value.headsign ?? '', value.routeVariant ?? '', value.period].join('|');
}

function processOptions(slug: string): ProcessOptions {
  const sourcePath = resolve(root, 'config/agencies', `${slug}.json`);
  const source = existsSync(sourcePath) ? JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown> : {};
  return {
    slug,
    force: true,
    edgeTransitionAudit: true,
    agencyId: typeof source.agencyId === 'string' ? source.agencyId : undefined,
    preprocess: typeof source.preprocess === 'string' ? source.preprocess as ProcessOptions['preprocess'] : undefined,
    excludeRouteShortNames: Array.isArray(source.excludeRouteShortNames) ? source.excludeRouteShortNames as string[] : undefined,
    excludeTripHeadsigns: Array.isArray(source.excludeTripHeadsigns) ? source.excludeTripHeadsigns as string[] : undefined,
    mergeEquivalentShapeVariants: source.mergeEquivalentShapeVariants === true,
  };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'atlas-edge-transition-terminal-audit/1.0' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function inspect(record: EdgeTransitionAuditRecord) {
  const period = TIME_PERIODS.find(item => item.key === record.period)!;
  const start = period.startHour * 60;
  const end = period.endHour * 60;
  const dt = forCrossMidnightWindow(record.departureTimes, end);
  const times = [...new Set(dt)]
    .filter(time => time >= start && time <= end)
    .sort((a, b) => a - b);
  const median = medianHeadwayInWindow(dt, start, end, 3);
  const gaps = times.slice(1).map((time, index) => time - times[index]);
  const grace = median == null ? null : Math.max(5, Math.round(median * 0.15));
  const oversized = median == null || grace == null
    ? []
    : gaps.map((gap, index) => ({ index, gap })).filter(item => item.gap > median + grace);
  const edgeIndexes = new Set([0, gaps.length - 1]);
  const edgeOversized = oversized.filter(item => edgeIndexes.has(item.index));
  const remaining = gaps.filter((_, index) => !edgeOversized.some(item => item.index === index));
  const boundarySustained = median != null && median > 0
    && (times[0] - start) / median <= 8
    && (end - times.at(-1)!) / median <= 8;
  const applicable = times.length >= 4
    && median != null
    && grace != null
    && boundarySustained
    && edgeOversized.length === 1
    && oversized.length === 1
    && remaining.length >= 3
    && remaining.every(gap => gap <= median + grace);
  return { departureCount: times.length, median, grace, gaps, leadingGap: times[0] == null ? null : times[0] - start, trailingGap: times.at(-1) == null ? null : end - times.at(-1)!, oversized, applicable };
}

async function main() {
  const index = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8')) as { agencies: Agency[] };
  const manifest = JSON.parse(readFileSync(resolve(candidateDir, 'manifest.json'), 'utf8')) as { agencies: Array<{ slug: string; status: string }> };
  const agencies = new Map(index.agencies.map(agency => [agency.slug, agency]));
  const candidates: Candidate[] = [];
  for (const entry of manifest.agencies.filter(item => item.status === 'ok')) {
    const artifact = JSON.parse(readFileSync(resolve(candidateDir, `${entry.slug}.json`), 'utf8')) as { features?: Feature[] };
    for (const feature of artifact.features ?? []) {
      const p = feature.properties ?? {};
      const strict = p.headwayByPeriodSustained ?? {};
      const experimental = p.headwayByPeriodSustainedEdgeTransition ?? {};
      for (const period of Object.keys(experimental) as PeriodKey[]) {
        if (strict[period] === false && experimental[period] === true) {
          candidates.push({
            agency: entry.slug,
            routeId: String(p.routeId),
            routeShortName: String(p.routeShortName),
            directionId: Number(p.directionId),
            day: String(p.day),
            headsign: p.headsign ?? null,
            routeVariant: p.routeVariant ?? null,
            period,
            headway: p.headwayByPeriod?.[period] ?? null,
            maxGap: p.maxGapByPeriod?.[period] ?? null,
          });
        }
      }
    }
  }
  const candidateKeys = new Set(candidates.map(featureKey));
  if (candidateKeys.size !== candidates.length) throw new Error('Candidate transition identity is not unique');

  const records = new Map<string, EdgeTransitionAuditRecord[]>();
  const agenciesProcessed: Array<Record<string, unknown>> = [];
  for (const slug of [...new Set(candidates.map(candidate => candidate.agency))].sort()) {
    const agency = agencies.get(slug);
    if (!agency?.feedUrl && !agency?.mdbFeedUrl) throw new Error(`No feed URL for ${slug}`);
    let auditRecords: EdgeTransitionAuditRecord[];
    let feedVersion: string | null = null;
    let featureCount: number | null = null;
    if (auditDir && existsSync(resolve(auditDir, `${slug}.edge-transition-audit.json`))) {
      process.stdout.write(`Reading saved audit ${slug}...\n`);
      auditRecords = JSON.parse(readFileSync(resolve(auditDir, `${slug}.edge-transition-audit.json`), 'utf8')) as EdgeTransitionAuditRecord[];
      const savedManifest = JSON.parse(readFileSync(resolve(auditDir, 'manifest.json'), 'utf8')) as { agencies?: Array<Record<string, unknown> & { slug: string }> };
      const saved = savedManifest.agencies?.find(entry => entry.slug === slug);
      feedVersion = typeof saved?.feedVersion === 'string' ? saved.feedVersion : null;
      featureCount = typeof saved?.featureCount === 'number' ? saved.featureCount : null;
    } else {
      process.stdout.write(`Auditing ${slug}...\n`);
      const result = await processGtfsBuffer(await fetchBuffer(agency.feedUrl ?? agency.mdbFeedUrl!), undefined, processOptions(slug));
      auditRecords = result.edgeTransitionAudit ?? [];
      feedVersion = result.feedVersion;
      featureCount = result.featureCount;
    }
    for (const record of auditRecords) {
      const key = featureKey(record);
      records.set(key, [...(records.get(key) ?? []), record]);
    }
    agenciesProcessed.push({ slug, name: agency.name, feedVersion, featureCount, auditRecordCount: auditRecords.length });
  }

  const audited = candidates.map(candidate => {
    const matches = records.get(featureKey(candidate)) ?? [];
    const record = matches.length === 1 ? matches[0] : null;
    const details = record ? inspect(record) : null;
    return { ...candidate, matchCount: matches.length, source: record?.source ?? null, shapeId: record?.shapeId ?? null, terminalStopId: record?.terminalStopId ?? null, departureTimes: record?.departureTimes ?? [], details, applicable: matches.length === 1 && details?.applicable === true, strict: record?.strict ?? null, experimental: record?.experimental ?? null };
  });
  const report = {
    candidateDir,
    agenciesProcessed,
    totalCandidates: candidates.length,
    auditedCount: audited.filter(item => item.matchCount === 1).length,
    applicableCount: audited.filter(item => item.applicable).length,
    missingCount: audited.filter(item => item.matchCount === 0).length,
    ambiguousCount: audited.filter(item => item.matchCount > 1).length,
    notApplicableCount: audited.filter(item => item.matchCount === 1 && !item.applicable).length,
    availableAuditRecords: [...records.entries()].map(([key, values]) => ({ key, count: values.length, records: values })),
    audited,
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, availableAuditRecords: undefined, audited: undefined }, null, 2));
  if (report.auditedCount !== report.totalCandidates || report.applicableCount !== report.totalCandidates) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
