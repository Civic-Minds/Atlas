/**
 * Post-publish check: right after publish-data-release, confirm the new release is live
 * and that a sample of agencies serves what the pre-flight produced. Read-only: it only
 * GETs public files from the data host and reads local pre-flight output.
 *
 *   npx tsx scripts/post-publish-check.ts --previous <old releaseId> --preflight <dir> [slug ...]
 *
 * --previous     the releaseId that was live before publishing (must have changed)
 * --expect       the releaseId that should now be live (optional, stricter than --previous)
 * --preflight    folder with the pre-flight artifacts: <dir>/<slug>.json or <dir>/<slug>/<slug>.json
 * --base         data host (default: the public one)
 * slugs          default: the #742 six, ttc, and five more across CA/US
 *
 * Per agency it FAILs when the file is missing or unreadable, carries another release stamp
 * or schema, is blank (no route lines, or a day type that had lines in pre-flight has none),
 * or its route count or per-day line counts differ from pre-flight. A content difference with
 * equal counts is a WARN. On-demand zones are checked only when the host publishes them.
 * Exit code 1 on any FAIL.
 */
import fs from 'fs';
import path from 'path';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { ROUTE_ARTIFACT_SCHEMA_VERSION } from '../shared/artifactSchema.js';
import { GATE_DAYS, summarizeArtifact, type ArtifactSummary } from '../pipeline/releaseDiff.js';
import { RELEASE_STAMP_FIELD } from '../pipeline/releaseGuard.js';

const DEFAULT_SLUGS = ['cdta', 'mbta', 'mnr', 'stm', 'pvta', 'blacksburg', 'ttc', 'edmonton', 'calgary', 'septa', 'halifax', 'grt'];

const argv = process.argv.slice(2);
const flag = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const valued = new Set(['--previous', '--expect', '--preflight', '--base']);
const slugs = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
const base = (flag('--base') ?? R2_PUBLIC_URL).replace(/\/$/, '');
const previous = flag('--previous');
const expect = flag('--expect');
const preflightDir = flag('--preflight');
if (!previous && !expect) throw new Error('Pass --previous <releaseId that was live before publishing> or --expect <new releaseId>.');
if (!preflightDir) throw new Error('Pass --preflight <folder with the pre-flight agency artifacts>.');

type Status = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
const rows: Array<{ check: string; status: Status; detail: string }> = [];
const record = (check: string, status: Status, detail: string) => rows.push({ check, status, detail });

async function get(key: string): Promise<{ status: number; text: string | null }> {
  // No-store and a cache-busting query, so a CDN copy of the old file can't pass.
  const url = `${base}/${key.replace(/^\//, '')}${key.includes('?') ? '&' : '?'}check=${Date.now()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
      return { status: res.status, text: res.ok ? await res.text() : null };
    } catch (error) {
      if (attempt === 1) return { status: 0, text: null };
    }
  }
  return { status: 0, text: null };
}

function preflightFile(slug: string): string | null {
  for (const candidate of [path.join(preflightDir!, `${slug}.json`), path.join(preflightDir!, slug, `${slug}.json`)]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const dayCounts = (s: ArtifactSummary) => GATE_DAYS.map(day => `${day} ${s.dayFeatures?.[day] ?? 0}`).join(', ');

// 1. The release pointer moved and its files are there.
const releaseRes = await get('atlas/release.json');
const release = releaseRes.text ? JSON.parse(releaseRes.text) as Record<string, unknown> : null;
const releaseId = typeof release?.releaseId === 'string' ? release.releaseId : null;
if (!release || !releaseId) {
  record('release.json', 'FAIL', `unreadable (HTTP ${releaseRes.status})`);
} else if (expect && releaseId !== expect) {
  record('release.json', 'FAIL', `live is ${releaseId}, expected ${expect}`);
} else if (previous && releaseId === previous) {
  record('release.json', 'FAIL', `still the previous release ${previous}`);
} else if (release.routeArtifactSchemaVersion !== ROUTE_ARTIFACT_SCHEMA_VERSION) {
  record('release.json', 'FAIL', `${releaseId}: schema ${String(release.routeArtifactSchemaVersion)}, app reads ${ROUTE_ARTIFACT_SCHEMA_VERSION}`);
} else {
  record('release.json', 'PASS', `${releaseId} (generated ${String(release.generatedAt ?? '?')})`);
}
for (const key of ['pmtilesKey', 'overviewPmtilesKey'] as const) {
  const value = release?.[key];
  if (typeof value !== 'string') { record(key, 'FAIL', 'missing from release.json'); continue; }
  // A one-byte range request shows the archive exists without downloading it.
  const res = await fetch(`${base}/${value}`, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  record(key, res && (res.status === 206 || res.status === 200) ? 'PASS' : 'FAIL', `${value} (HTTP ${res?.status ?? 'error'})`);
}

// 2. Sample agencies: served from the new release, not blank, same as pre-flight.
const agencyPrefix = typeof release?.agencyPrefix === 'string' ? release.agencyPrefix.replace(/\/$/, '') : null;
for (const slug of slugs.length ? slugs : DEFAULT_SLUGS) {
  const check = `agency ${slug}`;
  if (!agencyPrefix || !releaseId) { record(check, 'FAIL', 'no release to read from'); continue; }
  const live = await get(`${agencyPrefix}/${slug}.json`);
  if (!live.text) { record(check, 'FAIL', `${agencyPrefix}/${slug}.json HTTP ${live.status}`); continue; }
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(live.text) as Record<string, unknown>; } catch { record(check, 'FAIL', 'not JSON'); continue; }
  const problems: string[] = [];
  if (parsed[RELEASE_STAMP_FIELD] != null && parsed[RELEASE_STAMP_FIELD] !== releaseId) problems.push(`stamped ${String(parsed[RELEASE_STAMP_FIELD])}`);
  if (parsed.atlasSchemaVersion !== ROUTE_ARTIFACT_SCHEMA_VERSION) problems.push(`schema ${String(parsed.atlasSchemaVersion)}`);
  const liveSummary = summarizeArtifact(live.text, null);
  if (liveSummary.counts.routes === 0) problems.push('blank: no route lines');

  const file = preflightFile(slug);
  if (!file) {
    record(check, problems.length ? 'FAIL' : 'WARN', [...problems, `${liveSummary.counts.routes} routes; ${dayCounts(liveSummary)}; no pre-flight file to compare`].join('; '));
    continue;
  }
  const pre = summarizeArtifact(fs.readFileSync(file, 'utf8'), null);
  for (const day of GATE_DAYS) {
    const before = pre.dayFeatures?.[day] ?? 0;
    const after = liveSummary.dayFeatures?.[day] ?? 0;
    if (before > 0 && after === 0) problems.push(`blank ${day} (pre-flight had ${before} lines)`);
    else if (before !== after) problems.push(`${day} lines ${after} vs pre-flight ${before}`);
  }
  if (pre.counts.routes !== liveSummary.counts.routes) problems.push(`routes ${liveSummary.counts.routes} vs pre-flight ${pre.counts.routes}`);
  const summary = `${liveSummary.counts.routes} routes; ${dayCounts(liveSummary)}`;
  if (problems.length) record(check, 'FAIL', `${problems.join('; ')} (${summary})`);
  else if (pre.contentHash !== liveSummary.contentHash) record(check, 'WARN', `counts match pre-flight but line content differs (${summary})`);
  else record(check, 'PASS', `identical to pre-flight (${summary})`);
}

// 3. On-demand zones, when the host publishes them.
const onDemand = await get('atlas/on-demand/manifest.json');
if (onDemand.status === 404) {
  record('on-demand', 'SKIP', 'not published on this host (expected while on-demand is beta-only)');
} else if (!onDemand.text) {
  record('on-demand', 'FAIL', `manifest HTTP ${onDemand.status}`);
} else {
  const manifest = JSON.parse(onDemand.text) as { indexKey?: string; version?: string };
  const index = manifest.indexKey ? await get(`atlas/on-demand/${manifest.indexKey}`) : { status: 0, text: null };
  const services = index.text ? (JSON.parse(index.text) as { services?: Array<{ slug: string; geometryKey: string }> }).services ?? [] : [];
  const first = services[0];
  const geometry = first ? await get(`atlas/on-demand/v/${manifest.version}/${first.geometryKey}`) : { status: 0, text: null };
  const zones = geometry.text ? ((JSON.parse(geometry.text) as { features?: unknown[] }).features ?? []).length : 0;
  record('on-demand', services.length && zones ? 'PASS' : 'FAIL', `${services.length} services; ${first?.slug ?? 'none'} has ${zones} zones`);
}

const width = Math.max(...rows.map(r => r.check.length));
for (const r of rows) console.log(`${r.status.padEnd(4)}  ${r.check.padEnd(width)}  ${r.detail}`);
const fails = rows.filter(r => r.status === 'FAIL').length;
console.log(`\n${fails ? `${fails} FAIL` : 'All checks passed'} (${rows.filter(r => r.status === 'WARN').length} warn, ${rows.filter(r => r.status === 'SKIP').length} skip) against ${base}`);
process.exit(fails ? 1 : 0);
