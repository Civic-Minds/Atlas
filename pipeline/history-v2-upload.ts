#!/usr/bin/env npx tsx
/**
 * Upload one agency's locally built History v2 files to the PRIVATE archive bucket
 * (docs/data/DATA_HISTORY.md "Publishing History v2 (runbook)").
 *
 *   npm run history:upload -- --slug marta --dir tmp/history-v2                  dry run (default)
 *   ATLAS_HISTORY_V2=1 npm run history:upload -- --slug marta --dir tmp/history-v2 --write
 *   --period <periodKey>   only that period (optional)
 *
 * Reads what `backfill-history-v2.ts --out-dir <dir> --shapes` wrote:
 *   <dir>/history-v2/{slug}/{periodKey}.json          sidecars
 *   <dir>/history-v2-shapes/{slug}/{periodKey}.json   per-period shapes
 * and puts each at the same key through r2ArchiveSink. Keys are immutable: new -> put, identical
 * existing -> no-op, different existing -> CONFLICT (run stops, exit 1, nothing is overwritten).
 * All conflicts are checked before the first write, and a conflict that appears mid-run (a race)
 * stops the run at once. Exactly one agency per run. Every file is validated first (sidecars with
 * parseHistoryV2Sidecar; slug and periodKey must match the path); one bad file refuses the whole run.
 * A period whose sidecar has refDateQuality.holiday and no repick is skipped with a warning
 * (the build would drop it anyway), together with its shapes file.
 * The dry run reads the archive bucket only when credentials are configured
 * (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ARCHIVE_BUCKET_NAME).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHistoryV2Sidecar } from '../shared/historyV2Reader.js';
import type { HistoryV2Sink } from './historyV2.js';
import { assertWriteGate, byteLength, hasR2Credentials, isEntryPoint, parseFlags, type Env } from './historyPublishLib.js';

export type UploadState = 'new' | 'identical' | 'conflict' | 'unknown';

export interface UploadItem {
  key: string;
  kind: 'sidecar' | 'shapes';
  periodKey: string;
  body: string;
  bytes: number;
  state: UploadState;
}

export interface Remote {
  /** Read an archive object (null = missing). Used for dry-run and the pre-write conflict check. */
  peek(key: string): Promise<string | null>;
  /** r2ArchiveSink semantics: written | unchanged | conflict. */
  sink: HistoryV2Sink;
}

export interface UploadRunOptions {
  argv: string[];
  env: Env;
  log?: (line: string) => void;
  /** Injected in tests; the real factory only runs on --write or a credentialed dry run. */
  makeRemote?: () => Promise<Remote>;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const PERIOD_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export async function realRemote(): Promise<Remote> {
  const [{ r2ArchiveSink }, r2] = await Promise.all([import('./historyV2.js'), import('./r2.js')]);
  return { peek: key => r2.r2GetArchive(key), sink: await r2ArchiveSink() };
}

function isCoord(c: unknown): boolean {
  return Array.isArray(c) && c.length === 2 && c.every(n => typeof n === 'number' && Number.isFinite(n));
}

/** Check a per-period shapes archive file (the shape buildPeriodShapes writes). Returns an error message or null. */
export function checkPeriodShapes(input: unknown, slug: string, periodKey: string): string | null {
  const o = input as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'not a JSON object';
  if (o.version !== 1) return `unsupported shapes version ${String(o.version)}`;
  if (o.slug !== slug) return `slug in file is ${String(o.slug)}, expected ${slug}`;
  if (o.periodKey !== periodKey) return `periodKey in file is ${String(o.periodKey)}, expected ${periodKey}`;
  if (typeof o.refDate !== 'string') return 'refDate missing';
  if (typeof o.decimals !== 'number' || typeof o.toleranceM !== 'number') return 'decimals/toleranceM missing';
  const routes = o.routes as Record<string, { c?: unknown }> | null;
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) return 'routes must be an object';
  for (const [k, r] of Object.entries(routes)) {
    if (!r || !Array.isArray(r.c) || r.c.length < 2 || !r.c.every(isCoord)) return `route ${k}: c must be at least 2 [lon, lat] pairs`;
  }
  return null;
}

interface Scan { items: UploadItem[]; skipped: Array<{ periodKey: string; reason: string }>; errors: string[]; warnings: string[] }

function listJson(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
}

/** Read and validate local files. Pure of R2. */
export function scanLocal(dir: string, slug: string, period?: string): Scan {
  const out: Scan = { items: [], skipped: [], errors: [], warnings: [] };
  const sidecarDir = resolve(dir, 'history-v2', slug);
  const shapesDir = resolve(dir, 'history-v2-shapes', slug);
  const skippedPeriods = new Set<string>();
  const sidecarPeriods = new Set<string>();

  for (const f of listJson(sidecarDir)) {
    const periodKey = f.slice(0, -'.json'.length);
    if (period && periodKey !== period) continue;
    const key = `history-v2/${slug}/${f}`;
    const body = readFileSync(resolve(sidecarDir, f), 'utf8');
    let json: unknown;
    try { json = JSON.parse(body); } catch { out.errors.push(`${key}: not valid JSON`); continue; }
    const parsed = parseHistoryV2Sidecar(json);
    if (!parsed.ok) { out.errors.push(`${key}: ${parsed.error.code} at ${parsed.error.path || '(root)'}: ${parsed.error.message}`); continue; }
    const sc = parsed.value;
    if (sc.slug !== slug) { out.errors.push(`${key}: slug in file is ${sc.slug}, path says ${slug}`); continue; }
    if (sc.periodKey !== periodKey) { out.errors.push(`${key}: periodKey in file is ${sc.periodKey}, path says ${periodKey}`); continue; }
    const q = sc.refDateQuality;
    if (q?.holiday && !q.repicked) {
      out.skipped.push({ periodKey, reason: `holiday reference date, no repick (${q.reason}); the build would drop it` });
      skippedPeriods.add(periodKey);
      continue;
    }
    sidecarPeriods.add(periodKey);
    out.items.push({ key, kind: 'sidecar', periodKey, body, bytes: byteLength(body), state: 'unknown' });
  }

  for (const f of listJson(shapesDir)) {
    const periodKey = f.slice(0, -'.json'.length);
    if (period && periodKey !== period) continue;
    const key = `history-v2-shapes/${slug}/${f}`;
    if (skippedPeriods.has(periodKey)) { out.warnings.push(`${key}: skipped with its holiday-period sidecar`); continue; }
    const body = readFileSync(resolve(shapesDir, f), 'utf8');
    let json: unknown;
    try { json = JSON.parse(body); } catch { out.errors.push(`${key}: not valid JSON`); continue; }
    const err = checkPeriodShapes(json, slug, periodKey);
    if (err) { out.errors.push(`${key}: ${err}`); continue; }
    if (!sidecarPeriods.has(periodKey)) out.warnings.push(`${key}: no sidecar for this period in the run (shapes upload anyway; the build joins by sidecar period)`);
    out.items.push({ key, kind: 'shapes', periodKey, body, bytes: byteLength(body), state: 'unknown' });
  }
  out.items.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

function totals(items: UploadItem[]) {
  const t = { objects: items.length, bytes: 0, newObjects: 0, newBytes: 0, identicalObjects: 0, identicalBytes: 0, conflictObjects: 0, conflictBytes: 0 };
  for (const i of items) {
    t.bytes += i.bytes;
    if (i.state === 'new') { t.newObjects++; t.newBytes += i.bytes; }
    else if (i.state === 'identical') { t.identicalObjects++; t.identicalBytes += i.bytes; }
    else if (i.state === 'conflict') { t.conflictObjects++; t.conflictBytes += i.bytes; }
  }
  return t;
}

export async function runUpload(opts: UploadRunOptions): Promise<number> {
  const log = opts.log ?? (l => console.log(l));
  const { values, bools } = parseFlags(opts.argv, ['--slug', '--dir', '--period'], ['--write']);
  const write = bools.has('--write');
  assertWriteGate(write, opts.env);
  const slug = values['--slug'];
  const dir = values['--dir'];
  if (!slug || !dir) throw new Error('Usage: history-v2-upload.ts --slug <slug> --dir <out-dir> [--period <periodKey>] [--write]  (exactly one agency per run)');
  if (!SLUG_RE.test(slug)) throw new Error(`--slug must be exactly one agency slug (got "${slug}")`);
  const period = values['--period'];
  if (period && !PERIOD_RE.test(period)) throw new Error(`bad --period "${period}"`);

  const scan = scanLocal(dir, slug, period);
  if (scan.errors.length > 0) {
    log(`REFUSED: ${scan.errors.length} invalid local file(s); nothing was read from or written to R2:`);
    for (const e of scan.errors) log(`  ${e}`);
    return 1;
  }
  if (scan.items.length === 0 && scan.skipped.length === 0) {
    log(`REFUSED: no sidecars or shapes found for ${slug}${period ? ` period ${period}` : ''} under ${resolve(dir)}`);
    return 1;
  }

  const credentialed = hasR2Credentials(opts.env, 'R2_ARCHIVE_BUCKET_NAME');
  let remote: Remote | null = null;
  if (opts.makeRemote) remote = await opts.makeRemote();
  else if (write || credentialed) remote = await realRemote();

  if (remote) {
    for (const item of scan.items) {
      const existing = await remote.peek(item.key);
      item.state = existing == null ? 'new' : existing === item.body ? 'identical' : 'conflict';
    }
  }

  log(write ? `WRITE: about to upload ${slug} to the PRIVATE archive bucket` : 'DRY RUN (nothing will be written)');
  if (!remote) log('remote state unknown (no credentials; dry-run listing skipped)');
  for (const i of scan.items) {
    const verb = i.state === 'new' ? 'put (new)' : i.state === 'identical' ? 'no-op (identical)' : i.state === 'conflict' ? 'CONFLICT (differs, never overwritten)' : 'put or no-op (state unknown)';
    log(`  ${i.key}  ${i.bytes} bytes  ${verb}`);
  }
  for (const s of scan.skipped) log(`  SKIPPED period ${s.periodKey}: ${s.reason}`);
  for (const w of scan.warnings) log(`  warning: ${w}`);
  const t = totals(scan.items);
  log(`Totals: ${t.objects} objects, ${t.bytes} bytes; new ${t.newObjects} (${t.newBytes} bytes), identical ${t.identicalObjects} (${t.identicalBytes} bytes), conflict ${t.conflictObjects} (${t.conflictBytes} bytes), skipped periods ${scan.skipped.length}`);

  const conflicts = scan.items.filter(i => i.state === 'conflict');
  if (conflicts.length > 0) {
    log(`CONFLICT: ${conflicts.length} key(s) already hold different content. Nothing was written:`);
    for (const c of conflicts) log(`  ${c.key}`);
    return 1;
  }
  if (!write) {
    log('Re-run with --write (and ATLAS_HISTORY_V2=1) to upload.');
    return 0;
  }

  let written = 0;
  let unchanged = 0;
  for (const item of scan.items) {
    if (item.state === 'identical') { unchanged++; continue; }
    const res = await remote!.sink.put(item.key, item.body);
    if (res === 'conflict') {
      log(`CONFLICT while writing ${item.key} (it changed after the check). Stopped: ${written} written before it, later keys untouched.`);
      return 1;
    }
    if (res === 'written') written++; else unchanged++;
  }
  log(`Uploaded ${slug}: ${written} written, ${unchanged} already identical.`);
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  (async () => {
    await import('./loadEnv.js');
    process.exitCode = await runUpload({ argv: process.argv.slice(2), env: process.env });
  })().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
