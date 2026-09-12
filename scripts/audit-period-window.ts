#!/usr/bin/env node
/** Local only. No publication, registry writes, or remote fare lookup.
 * Run: npx tsx scripts/audit-period-window.ts --base-module /checkout/pipeline/process-core.ts
 *      --out /audit/before --feed ttc=/feeds/ttc.zip [--feed slug=/feed.zip ...]
 * Compare: npx tsx scripts/audit-period-window.ts --compare /audit/before /audit/after --out /audit/diff
 * Each feed runs in a fresh process. Existing output files are never overwritten.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

type Obj = Record<string, any>;
const additive = new Set(['periodCoverageHeadway', 'stopPeriodCoverageHeadways', 'worstDirectionPeriodCoverageHeadway']);
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
function value(name: string): string {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing ${name}`);
  return args[i + 1];
}
function canonical(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const stableJsonHash = (v: unknown) => hash(canonical(v));
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
function write(p: string, v: unknown) { writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx' }); }
function git(root: string, ...a: string[]) { return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim(); }
function sourceState(root: string) {
  const files = git(root, 'ls-files', '-z', 'pipeline', 'shared', 'types').split('\0').filter(Boolean).sort();
  return { head: git(root, 'rev-parse', 'HEAD'), status: git(root, 'status', '--porcelain'),
    sourceHash: hash(files.map(p => p + ':' + hash(readFileSync(join(root, p)))).join('\n')) };
}
function features(raw: string, kind: string): Obj {
  const rows: Obj = {};
  for (const f of JSON.parse(raw).features) {
    const p = f.properties;
    if (!p?.routeId) continue;
    // Geometry disambiguates real shape variants. Changes become explicit removed/added
    // identities, never silently paired by array position or by a non-unique shape_id.
    const identity = [kind, ...['routeId', 'routeShortName', 'directionId', 'day', 'headsign', 'routeBranch', 'isCorridor'].map(k => p[k] ?? null), hash(canonical(f.geometry))];
    const id = canonical(identity);
    if (rows[id]) throw new Error(`Duplicate feature identity; refusing ambiguous pairing: ${id}`);
    rows[id] = { identity, geometryHash: hash(canonical(f.geometry)), properties: p };
  }
  return rows;
}
function flatten(v: any, path: string[] = [], out: Obj = {}): Obj {
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) flatten(v[k], [...path, k], out);
  } else out[JSON.stringify(path)] = v;
  return out;
}
function metricProps(p: Obj): Obj {
  return Object.fromEntries(Object.entries(p).filter(([k]) => /headway|period|maxgap|tier|serviceclass|nightservice/i.test(k)));
}
const emptyCounts = () => ({ compared: 0, changed: 0, newlyNull: 0, newlyPresent: 0, material: 0 });
function compare(before: Obj, after: Obj) {
  const summary: Obj = { beforeFeatures: Object.keys(before).length, afterFeatures: Object.keys(after).length,
    addedIdentities: [], removedIdentities: [], existingFieldChanges: 0, metrics: emptyCounts(), byField: {} };
  const changes: Obj[] = [];
  for (const id of Object.keys(before)) if (!after[id]) summary.removedIdentities.push(id);
  for (const id of Object.keys(after)) if (!before[id]) summary.addedIdentities.push(id);
  for (const id of Object.keys(before)) {
    if (!after[id]) continue;
    const bp = before[id].properties, ap = after[id].properties;
    for (const k of new Set([...Object.keys(bp), ...Object.keys(ap)])) {
      if (!additive.has(k) && canonical(bp[k] ?? null) !== canonical(ap[k] ?? null)) {
        summary.existingFieldChanges++;
        changes.push({ id, field: k, type: 'existing-field-invariant', before: bp[k] ?? null, after: ap[k] ?? null });
      }
    }
    const b = flatten(metricProps(bp)), a = flatten(metricProps(ap));
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const bv = b[key] ?? null, av = a[key] ?? null;
      const field = JSON.parse(key)[0];
      const c = summary.byField[field] ??= emptyCounts();
      c.compared++; summary.metrics.compared++;
      if (bv === av) continue;
      const newlyNull = bv !== null && av === null, newlyPresent = bv === null && av !== null;
      const numeric = typeof bv === 'number' && typeof av === 'number';
      const delta = numeric ? Math.abs(av - bv) : null;
      const relative = numeric ? (bv === 0 ? (av === 0 ? 0 : Infinity) : delta! / Math.abs(bv)) : null;
      const material = numeric && (relative! > 0.2 || delta! >= 5);
      for (const counts of [c, summary.metrics]) {
        counts.changed++; if (newlyNull) counts.newlyNull++; if (newlyPresent) counts.newlyPresent++; if (material) counts.material++;
      }
      changes.push({ id, path: JSON.parse(key), type: 'metric', before: bv, after: av, newlyNull, newlyPresent, material, absoluteDelta: delta, relativeDelta: relative === Infinity ? 'Infinity' : relative });
    }
  }
  summary.identitiesStable = !summary.addedIdentities.length && !summary.removedIdentities.length;
  summary.existingFieldsUnchanged = summary.existingFieldChanges === 0;
  return { summary, changes };
}

async function runOne(modulePath: string, out: string, feed: string) {
  const equal = feed.indexOf('=');
  if (equal < 1) throw new Error('Feed must be slug=/absolute/path.zip');
  const slug = feed.slice(0, equal), feedPath = resolve(feed.slice(equal + 1));
  if (!/^[a-z0-9_-]+$/.test(slug)) throw new Error(`Invalid slug ${slug}`);
  const root = resolve(dirname(modulePath), '..');
  const registryPath = join(root, 'public/data/index.json');
  const entry = read(registryPath).agencies.find((a: Obj) => a.slug === slug);
  if (!entry) throw new Error(`${slug} missing from ${registryPath}`);
  // Same processing options as process-gtfs. Record legacy fare explicitly;
  // a live R2 fare override is intentionally omitted for an offline deterministic audit.
  const options: Obj = { slug };
  for (const k of ['agencyId', 'preprocess', 'excludeRouteShortNames', 'excludeTripHeadsigns', 'mergeEquivalentShapeVariants']) if (entry[k] !== undefined) options[k] = entry[k];
  if (entry.fare != null) options.manualBaseFare = entry.fare;
  const state = sourceState(root), buf = readFileSync(feedPath), started = new Date().toISOString();
  const { processGtfsBuffer } = await import(pathToFileURL(modulePath).href);
  const logs: string[] = [];
  const result = await processGtfsBuffer(buf, (s: string) => { logs.push(s); }, options);
  const endState = sourceState(root);
  if (state.sourceHash !== endState.sourceHash) throw new Error(`Processing source changed during ${slug}; rerun into a fresh output directory`);
  const snapshot = { ...features(result.geojson, 'route'), ...features(result.corridorsGeojson, 'corridor') };
  write(join(out, `${slug}.features.json`), snapshot);
  write(join(out, `${slug}.metrics.json`), Object.fromEntries(Object.entries(snapshot).map(([id, f]) => [id, metricProps(f.properties)])));
  const stopsMeta = JSON.parse(result.stopsMetaJson);
  delete stopsMeta.generatedAt;
  write(join(out, `${slug}.metadata.json`), { slug, feedPath, inputSha256: hash(buf), inputBytes: buf.length, modulePath, registryPath,
    registrySha256: hash(readFileSync(registryPath)), options, source: state, started, finished: new Date().toISOString(),
    timezone: result.timezone, feedExpiry: result.feedExpiry, feedVersion: result.feedVersion, center: result.center,
    featureCount: result.featureCount, totalFeatureCount: Object.keys(snapshot).length, feedQuality: result.feedQuality,
    shapeAnomalies: result.shapeAnomalies, stopsHash: hash(result.stopsJson), stopsMetaHash: stableJsonHash(stopsMeta), tripsHash: hash(result.tripsJson),
    farePolicy: 'registry legacy fare only; no remote override', logs });
  console.log(`${slug}: ${result.featureCount} route features; saved ${out}`);
}

async function main() {
  if (flag('--help')) {
    console.log('Run: --base-module /checkout/pipeline/process-core.ts --out /audit/before --feed slug=/feed.zip (repeatable)\nCompare: --compare /audit/before /audit/after --out /audit/diff\nMaterial: absolute change >=5 minutes OR relative change >20%. Only the two coverage fields are exempt from existing-field invariants.');
    return;
  }
  const out = resolve(value('--out'));
  mkdirSync(out, { recursive: true });
  if (flag('--compare')) {
    const i = args.indexOf('--compare'), beforeDir = resolve(args[i + 1]), afterDir = resolve(args[i + 2]);
    const bm = read(join(beforeDir, 'manifest.json')), am = read(join(afterDir, 'manifest.json'));
    if (canonical([...bm.slugs].sort()) !== canonical([...am.slugs].sort())) throw new Error('Agency sets differ');
    const report: Obj = { policy: 'Material = >20% OR >=5 minutes; null includes absent. Added/removed identities are separate from matched metric changes.', agencies: {}, passed: true };
    for (const slug of bm.slugs) {
      const bmeta = read(join(beforeDir, `${slug}.metadata.json`)), ameta = read(join(afterDir, `${slug}.metadata.json`));
      if (bmeta.inputSha256 !== ameta.inputSha256 || canonical(bmeta.options) !== canonical(ameta.options)) throw new Error(`${slug}: inputs/options differ`);
      const diff = compare(read(join(beforeDir, `${slug}.features.json`)), read(join(afterDir, `${slug}.features.json`)));
      diff.summary.artifactInvariants = Object.fromEntries(['stopsHash', 'stopsMetaHash', 'tripsHash'].map(k => [k, bmeta[k] === ameta[k]]));
      diff.summary.passed = diff.summary.identitiesStable && diff.summary.existingFieldsUnchanged && Object.values(diff.summary.artifactInvariants).every(Boolean);
      report.passed &&= diff.summary.passed;
      report.agencies[slug] = diff.summary;
      write(join(out, `${slug}.changes.json`), diff.changes);
    }
    write(join(out, 'summary.json'), report);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 2;
    return;
  }
  const modulePath = resolve(value('--base-module'));
  const feeds = args.flatMap((v, i) => v === '--feed' ? [args[i + 1]] : []);
  if (!feeds.length || feeds.some(f => !f)) throw new Error('At least one --feed slug=/feed.zip required');
  if (flag('--one')) { await runOne(modulePath, out, feeds[0]); return; }
  const slugs = feeds.map(f => f.split('=')[0]);
  if (new Set(slugs).size !== slugs.length) throw new Error('Duplicate agency slugs');
  if (existsSync(join(out, 'manifest.json'))) throw new Error('Output already complete; choose a fresh directory');
  for (const slug of slugs) for (const suffix of ['features', 'metrics', 'metadata']) if (existsSync(join(out, `${slug}.${suffix}.json`))) throw new Error(`Existing ${slug} output; choose a fresh directory`);
  const initial = sourceState(resolve(dirname(modulePath), '..'));
  for (const feed of feeds) {
    const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--one', '--base-module', modulePath, '--out', out, '--feed', feed], { stdio: 'inherit', env: { ...process.env, TZ: 'UTC' } });
    if (child.status !== 0) throw new Error(`Audit failed for ${feed}: ${child.error ?? child.signal ?? child.status}`);
  }
  if (initial.sourceHash !== sourceState(resolve(dirname(modulePath), '..')).sourceHash) throw new Error('Source changed across agencies; rerun');
  write(join(out, 'manifest.json'), { slugs, feeds, modulePath, source: initial, created: new Date().toISOString() });
}
main().catch(e => { console.error(e); process.exitCode = 1; });
