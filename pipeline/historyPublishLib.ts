/**
 * Shared pieces of the History v2 publish tooling (history-config-backup / -restore,
 * history-v2-upload). Everything that touches R2 goes through the small BucketIO interface so
 * tests inject fakes; the real client is only built by the factories below, and those are only
 * called on --write or on a dry run with credentials configured.
 *
 * Nothing here is imported by refresh / build-history / any default path.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const HISTORY_CONFIG_KEY = 'atlas/history-config.json';
export const HISTORY_AGENCIES_PATH = 'shared/data/history-agencies.json';

/** The slice of an R2 bucket these tools use. get returns null for a missing key. */
export interface BucketIO {
  get(key: string): Promise<{ body: string; etag?: string } | null>;
  put(key: string, body: string): Promise<void>;
}

export type Env = Record<string, string | undefined>;

export function sha256(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export function byteLength(body: string): number {
  return Buffer.byteLength(body, 'utf8');
}

/** UTC YYYYMMDD-HHMMSS. */
export function stampOf(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(now.getUTCFullYear(), 4)}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}

/** --write needs ATLAS_HISTORY_V2=1 in the environment (same exact-value rule as the build). */
export function assertWriteGate(write: boolean, env: Env): void {
  if (write && env.ATLAS_HISTORY_V2 !== '1') {
    throw new Error('--write refused: set ATLAS_HISTORY_V2=1 in the environment to publish History v2 data (dry run needs no flag).');
  }
}

/** True when the S3 credentials and the named bucket are configured (values are never read out). */
export function hasR2Credentials(env: Env, bucketVar: 'R2_BUCKET_NAME' | 'R2_ARCHIVE_BUCKET_NAME'): boolean {
  return ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', bucketVar].every(k => !!env[k]);
}

/** Real PUBLIC bucket (R2_BUCKET_NAME) access via pipeline/r2.ts. Builds the S3 client lazily: call only when needed. */
export async function publicBucketIO(): Promise<BucketIO> {
  const r2 = await import('./r2.js');
  return {
    async get(key) {
      const body = await r2.r2Get(key);
      return body == null ? null : { body };
    },
    async put(key, body) {
      await r2.r2Put(key, body, 'application/json');
    },
  };
}

export function manifestKeyFor(backupKey: string): string {
  return backupKey.replace(/\.json$/, '.manifest.json');
}

export function backupKeyFor(kind: 'backup' | 'pre-restore', stamp: string): string {
  return `atlas/history-config.${kind}-${stamp}.json`;
}

export interface BackupManifest {
  sourceKey: string;
  backupKey: string;
  sizeBytes: number;
  sha256: string;
  etag?: string;
  createdAt: string;
  agencyCount: number;
  gitCommit: string;
  /** shared/data/history-agencies.json at backup time (the list the UI reads; revert it with git). */
  agencyList: { sizeBytes: number; sha256: string; count: number; slugs: string[] } | null;
}

export function agencyCountOf(body: string): number {
  try {
    const v: unknown = JSON.parse(body);
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

/** Local shared/data/history-agencies.json summary (null when unreadable). */
export function readAgencyListSummary(readFile: (p: string) => string = p => readFileSync(p, 'utf8')): BackupManifest['agencyList'] {
  try {
    const raw = readFile(resolve(HISTORY_AGENCIES_PATH));
    const parsed = JSON.parse(raw) as { slugs?: unknown };
    const slugs = Array.isArray(parsed.slugs) ? parsed.slugs.filter((s): s is string => typeof s === 'string') : [];
    return { sizeBytes: byteLength(raw), sha256: sha256(raw), count: slugs.length, slugs };
  } catch {
    return null;
  }
}

export function currentGitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export interface BackupPlan {
  sourceKey: string;
  backupKey: string;
  manifestKey: string;
  sizeBytes: number;
  sha256: string;
  agencyCount: number;
  /** 'new' unless a key already exists (then the run refuses). */
  backupKeyState: 'new' | 'exists';
  manifestKeyState: 'new' | 'exists';
}

export interface BackupDeps {
  io: BucketIO;
  now: Date;
  gitCommit: string;
  agencyList: BackupManifest['agencyList'];
  kind?: 'backup' | 'pre-restore';
  /** Test hook: stamp override (e.g. to force a key that already exists). */
  stamp?: string;
}

/**
 * Plan (read only): read the source, work out the backup key and whether it is free.
 * Returns null when the source object does not exist.
 */
export async function planBackup(deps: BackupDeps): Promise<{ plan: BackupPlan; body: string; etag?: string } | null> {
  const src = await deps.io.get(HISTORY_CONFIG_KEY);
  if (!src) return null;
  const backupKey = backupKeyFor(deps.kind ?? 'backup', deps.stamp ?? stampOf(deps.now));
  const manifestKey = manifestKeyFor(backupKey);
  const [b, m] = [await deps.io.get(backupKey), await deps.io.get(manifestKey)];
  return {
    body: src.body,
    etag: src.etag,
    plan: {
      sourceKey: HISTORY_CONFIG_KEY,
      backupKey,
      manifestKey,
      sizeBytes: byteLength(src.body),
      sha256: sha256(src.body),
      agencyCount: agencyCountOf(src.body),
      backupKeyState: b ? 'exists' : 'new',
      manifestKeyState: m ? 'exists' : 'new',
    },
  };
}

/**
 * Write a verified, immutable backup of the public history-config.json:
 * refuse if either key exists, put the copy, read it back (size + sha256), and only then put the manifest.
 * A manifest therefore exists only for a backup that verified.
 */
export async function writeBackup(deps: BackupDeps, planned: { plan: BackupPlan; body: string; etag?: string }): Promise<BackupManifest> {
  const { plan, body } = planned;
  if (plan.backupKeyState === 'exists' || plan.manifestKeyState === 'exists') {
    throw new Error(`refusing to overwrite an existing backup: ${plan.backupKeyState === 'exists' ? plan.backupKey : plan.manifestKey} (backups are immutable; retry in a second for a new stamp)`);
  }
  await deps.io.put(plan.backupKey, body);
  const back = await deps.io.get(plan.backupKey);
  if (!back) throw new Error(`read-back failed: ${plan.backupKey} is missing after the copy (manifest NOT written)`);
  if (byteLength(back.body) !== plan.sizeBytes || sha256(back.body) !== plan.sha256) {
    throw new Error(`read-back mismatch for ${plan.backupKey}: expected ${plan.sizeBytes} bytes sha256 ${plan.sha256}, got ${byteLength(back.body)} bytes sha256 ${sha256(back.body)} (manifest NOT written; the copy is unverified, do not rely on it)`);
  }
  const manifest: BackupManifest = {
    sourceKey: plan.sourceKey,
    backupKey: plan.backupKey,
    sizeBytes: plan.sizeBytes,
    sha256: plan.sha256,
    ...(planned.etag ? { etag: planned.etag } : {}),
    createdAt: deps.now.toISOString(),
    agencyCount: plan.agencyCount,
    gitCommit: deps.gitCommit,
    agencyList: deps.agencyList,
  };
  await deps.io.put(plan.manifestKey, JSON.stringify(manifest, null, 2));
  return manifest;
}

export function describePlan(plan: BackupPlan): string[] {
  return [
    `  read   ${plan.sourceKey}  (${plan.sizeBytes} bytes, sha256 ${plan.sha256}, ${plan.agencyCount} agencies)`,
    `  write  ${plan.backupKey}  (${plan.backupKeyState === 'new' ? 'new' : 'EXISTS: would refuse'})`,
    `  write  ${plan.manifestKey}  (${plan.manifestKeyState === 'new' ? 'new' : 'EXISTS: would refuse'})`,
  ];
}

/** Tiny shared flag parser: --name value pairs and bare booleans. Repeated value flags are an error. */
export function parseFlags(argv: string[], valueFlags: string[], boolFlags: string[]): { values: Record<string, string>; bools: Set<string> } {
  const values: Record<string, string> = {};
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (boolFlags.includes(a)) { bools.add(a); continue; }
    if (valueFlags.includes(a)) {
      const v = argv[++i];
      if (v == null || v.startsWith('--')) throw new Error(`${a} needs a value`);
      if (a in values) throw new Error(`${a} given more than once`);
      values[a] = v;
      continue;
    }
    throw new Error(`unknown argument: ${a}`);
  }
  return { values, bools };
}

/** True when this module is the process entry point (so importing it in tests never runs main). */
export function isEntryPoint(metaUrl: string): boolean {
  const entry = process.argv[1];
  return !!entry && metaUrl === new URL(`file://${resolve(entry)}`).href;
}
