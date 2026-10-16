/**
 * Read-only audit: for every published agency, check that the app's in-memory frequency-filter
 * decision matches the PMTiles map decision, and that no route passes "every N min or less"
 * while one of its directions runs less often than N.
 *
 * Reads https://data.transitatlas.fyi/atlas/release.json and the release's agency JSON only, or,
 * with --dir, a local folder (so a branch's own reprocess output can be checked before it is published).
 * Writes nothing (stdout only).
 *
 *   npx tsx scripts/audit-headway-filter-consistency.ts [slug ...] [--examples=N] [--concurrency=N]
 *   npx tsx scripts/audit-headway-filter-consistency.ts --dir=PATH [slug ...]
 *     PATH holds <slug>/<slug>.json (reprocess-derived-artifacts output) or <slug>.json files;
 *     without slugs every agency found there is audited. The index.json and the release are not read.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AUDIT_KINDS, auditAgencyFeatures, type AuditMismatch } from './headway-filter-audit-core';

const BASE = 'https://data.transitatlas.fyi';
const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const exampleCount = flag('examples', 15);
const concurrency = flag('concurrency', 4);
const requested = args.filter(a => !a.startsWith('--'));
const localDir = args.find(a => a.startsWith('--dir='))?.slice('--dir='.length);

/** The route file for a slug inside a local folder, or null. */
function localFile(dir: string, slug: string): string | null {
  return [path.join(dir, slug, `${slug}.json`), path.join(dir, `${slug}.json`)].find(existsSync) ?? null;
}

/** Agency slugs found in a local folder, in name order. */
function localSlugs(dir: string): string[] {
  const found = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && localFile(dir, entry.name)) found.add(entry.name);
    else if (entry.isFile() && entry.name.endsWith('.json') && !/-(corridors|stops|stops-meta|trips)\.json$/.test(entry.name)) found.add(entry.name.slice(0, -5));
  }
  return [...found].sort();
}

async function main() {
  // MapLibre's evaluator warns (and falls back to false) when a headway is missing; that is the
  // expected tile behaviour, not an audit problem.
  const warn = console.warn;
  console.warn = (...parts: unknown[]) => {
    if (typeof parts[0] === 'string' && parts[0].includes('Falling back to false')) return;
    warn(...parts);
  };

  let release: { releaseId: string; agencyPrefix: string } | null = null;
  let slugs: string[];
  if (localDir) {
    slugs = requested.length > 0 ? requested : localSlugs(localDir);
    console.log(`Local ${localDir}: auditing ${slugs.length} agencies`);
  } else {
    release = await (await fetch(`${BASE}/atlas/release.json`)).json() as { releaseId: string; agencyPrefix: string };
    const here = path.dirname(fileURLToPath(import.meta.url));
    const index = JSON.parse(readFileSync(path.join(here, '../public/data/index.json'), 'utf8'));
    const entries: Array<{ slug: string }> = Array.isArray(index) ? index : (index.agencies ?? Object.values(index));
    slugs = requested.length > 0 ? requested : entries.map(e => e.slug);
    console.log(`Release ${release.releaseId}: auditing ${slugs.length} agencies`);
  }

  const kinds: AuditMismatch['kind'][] = [...AUDIT_KINDS];
  const totals = { agencies: 0, missing: 0, routes: 0, checks: 0 };
  const routesByKind: Record<string, Set<string>> = Object.fromEntries(kinds.map(k => [k, new Set<string>()]));
  const agenciesByKind: Record<string, Set<string>> = Object.fromEntries(kinds.map(k => [k, new Set<string>()]));
  const distinctRoutesByKind: Record<string, Set<string>> = Object.fromEntries(kinds.map(k => [k, new Set<string>()]));
  // Same, excluding Frequency = All (Infinity), i.e. only real "every N min or less" thresholds.
  const thresholdRoutesByKind: Record<string, Set<string>> = Object.fromEntries(kinds.map(k => [k, new Set<string>()]));
  const examples: Record<string, AuditMismatch[]> = Object.fromEntries(kinds.map(k => [k, []]));

  let next = 0;
  async function worker() {
    while (next < slugs.length) {
      const slug = slugs[next++];
      try {
        let data: { features?: any[] };
        if (localDir) {
          const file = localFile(localDir, slug);
          if (!file) { totals.missing++; continue; }
          data = JSON.parse(readFileSync(file, 'utf8')) as { features?: any[] };
        } else {
          const res = await fetch(`${BASE}/${release!.agencyPrefix}/${slug}.json`);
          if (!res.ok) { totals.missing++; continue; }
          data = await res.json() as { features?: any[] };
        }
        const result = auditAgencyFeatures(slug, data.features ?? []);
        totals.agencies++;
        totals.routes += result.routes;
        totals.checks += result.checks;
        for (const kind of kinds) {
          for (const key of result.routesByKind[kind]) routesByKind[kind].add(key);
          if (result.routesByKind[kind].size > 0) agenciesByKind[kind].add(slug);
        }
        for (const m of result.mismatches) {
          distinctRoutesByKind[m.kind].add(m.routeKey);
          if (m.maxHeadway !== Infinity) thresholdRoutesByKind[m.kind].add(m.routeKey);
          if (examples[m.kind].length < exampleCount) examples[m.kind].push(m);
        }
      } catch (err) {
        totals.missing++;
        console.warn(`  ${slug}: ${(err as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  console.log(`Audited ${totals.agencies} agencies (${totals.missing} unavailable), ${totals.routes} route-days, ${totals.checks} feature checks`);
  for (const kind of kinds) {
    console.log(`\n${kind}: ${distinctRoutesByKind[kind].size} routes (${thresholdRoutesByKind[kind].size} at a real N-minute threshold), ${routesByKind[kind].size} route-days, ${agenciesByKind[kind].size} agencies`);
    for (const m of examples[kind]) {
      console.log(`  ${m.agency} ${m.route} ${m.day} ${m.period} <=${m.maxHeadway}: ${m.detail}`);
    }
  }
  const failed = kinds.some(k => routesByKind[k].size > 0);
  process.exitCode = failed ? 1 : 0;
}

main().catch(err => { console.error(err); process.exitCode = 2; });
