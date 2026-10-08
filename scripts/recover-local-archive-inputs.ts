#!/usr/bin/env npx tsx
/**
 * Download and locally validate replacement inputs for agencies whose raw
 * archive is missing. This never writes to R2, the registry, or agency config.
 *
 * Usage:
 *   npm run recover-local-archive-inputs
 *   npm run recover-local-archive-inputs -- --sources-file tmp/source-overrides.json
 *
 * The optional source file is a JSON object keyed by agency slug. Values may
 * be a URL string or { "url": "...", "kind": "manual" }.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { processGtfsBuffer, type GtfsPreprocess } from '../pipeline/process-core.js';
import { buildFeedCandidates } from '../pipeline/feedSourceCandidates.js';
import { resolveFeedUrl } from '../pipeline/feedUrl.js';

interface Agency {
  slug: string;
  agencyId?: string;
  agencyName?: string;
  preprocess?: GtfsPreprocess;
  routeTypes?: number[];
  excludeRouteShortNames?: string[];
  excludeTripHeadsigns?: string[];
  skipLetterSuffixMerge?: boolean;
  mergeEquivalentShapeVariants?: boolean;
  fare?: number;
  feedUrl?: string | null;
  mdbFeedUrl?: string | null;
  feedApiKeyEnvVar?: string;
  feedApiKeyParam?: string;
}

interface RecoveryRow {
  slug: string;
  status: 'recovered' | 'unavailable' | 'invalid';
  sourceUrl?: string;
  sourceKind?: string;
  localPath?: string;
  featureCount?: number;
  feedExpiry?: string | null;
  feedVersion?: string | null;
  feedQuality?: { status: string; score: number };
  reason?: string;
}

const args = process.argv.slice(2);
const sourceFileArg = args.find(arg => arg.startsWith('--sources-file='))?.slice('--sources-file='.length);
const outputDir = resolve('tmp/derived-reprocess-inputs');
const reportPath = resolve('tmp/derived-reprocess/report.json');

function loadSources(): Record<string, { url: string; kind: string }> {
  if (!sourceFileArg) return {};
  const raw = JSON.parse(readFileSync(resolve(sourceFileArg), 'utf8')) as Record<string, string | { url: string; kind?: string }>;
  return Object.fromEntries(Object.entries(raw).map(([slug, value]) => [
    slug,
    typeof value === 'string' ? { url: value, kind: 'manual' } : { url: value.url, kind: value.kind ?? 'manual' },
  ]));
}

async function download(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'atlas-local-archive-recovery/1.0' },
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (fetchError) {
    try {
      return execFileSync('curl', ['-fsSL', url], { maxBuffer: 256 * 1024 * 1024, timeout: 180_000 });
    } catch {
      throw fetchError instanceof Error ? fetchError : new Error(String(fetchError));
    }
  }
}

function processOptions(agency: Agency) {
  return {
    slug: agency.slug,
    agencyId: agency.agencyId,
    agencyName: agency.agencyName,
    routeTypes: agency.routeTypes,
    preprocess: agency.preprocess,
    excludeRouteShortNames: agency.excludeRouteShortNames,
    excludeTripHeadsigns: agency.excludeTripHeadsigns,
    skipLetterSuffixMerge: agency.skipLetterSuffixMerge,
    mergeEquivalentShapeVariants: agency.mergeEquivalentShapeVariants,
    manualBaseFare: agency.fare,
  };
}

async function recover(agency: Agency, source: { url: string; kind: string }): Promise<RecoveryRow> {
  try {
    const body = await download(source.url);
    if (body.length < 4 || body[0] !== 0x50 || body[1] !== 0x4b) {
      throw new Error('downloaded content is not a ZIP file');
    }
    const result = await processGtfsBuffer(body, undefined, processOptions(agency));
    if (result.featureCount === 0) throw new Error('processed feed produced 0 route features');
    const localPath = resolve(outputDir, `${agency.slug}.zip`);
    writeFileSync(localPath, body);
    return {
      slug: agency.slug,
      status: 'recovered',
      sourceUrl: source.url,
      sourceKind: source.kind,
      localPath,
      featureCount: result.featureCount,
      feedExpiry: result.feedExpiry,
      feedVersion: result.feedVersion,
      feedQuality: { status: result.feedQuality.status, score: result.feedQuality.score },
    };
  } catch (error) {
    return {
      slug: agency.slug,
      status: 'unavailable',
      sourceUrl: source.url,
      sourceKind: source.kind,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  if (!existsSync(reportPath)) throw new Error(`Missing ${reportPath}; run the full reprocess dry run first.`);
  const index = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as { agencies: Agency[] };
  const prior = JSON.parse(readFileSync(reportPath, 'utf8')) as { agencies: Array<{ slug: string; status: string; reason?: string }> };
  const missing = new Set(prior.agencies.filter(row => row.status === 'failed' && row.reason?.startsWith('no archived')).map(row => row.slug));
  const sources = loadSources();
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const rows: RecoveryRow[] = [];
  for (const agency of index.agencies.filter(candidate => missing.has(candidate.slug))) {
    const configured = resolveFeedUrl(agency.feedUrl, agency.feedApiKeyEnvVar, agency.feedApiKeyParam);
    const candidates = sources[agency.slug]
      ? [sources[agency.slug]]
      : buildFeedCandidates(configured, agency.mdbFeedUrl).map(candidate => ({ url: candidate.url, kind: candidate.kind }));
    if (candidates.length === 0) {
      rows.push({ slug: agency.slug, status: 'unavailable', reason: 'no configured or manual source candidate' });
      continue;
    }
    let recovered: RecoveryRow | null = null;
    for (const candidate of candidates) {
      const result = await recover(agency, candidate);
      if (result.status === 'recovered') { recovered = result; break; }
      recovered = result;
    }
    rows.push(recovered!);
    console.log(`${recovered!.status.toUpperCase()} ${agency.slug}${recovered!.reason ? ` — ${recovered!.reason}` : ''}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    outputDir,
    sourceFile: sourceFileArg ?? null,
    totals: {
      requested: rows.length,
      recovered: rows.filter(row => row.status === 'recovered').length,
      unavailable: rows.filter(row => row.status !== 'recovered').length,
    },
    rows,
  };
  writeFileSync(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.totals));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
