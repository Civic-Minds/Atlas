/**
 * `npm run audit-live-state` (CIV-1689): what the GTFS-RT archive is really doing on Cloudflare.
 *
 *   1. Each archiver Worker's live cron schedules next to the `[triggers]` in its
 *      workers/gtfs-rt-archiver/wrangler*.toml (matched by the toml's `name`), with mismatches flagged.
 *   2. For each live bucket (atlas-live, atlas-live-kingston), the newest object under every
 *      prefix (`positions/<slug>/` and `<slug>/`) and its age. Date folders are read newest-first,
 *      so only the newest day is listed. Slugs the archive config expects but the bucket lacks show "none".
 *   3. Each bucket's lifecycle rules.
 *
 * Read-only: GET requests only. Auth: CLOUDFLARE_API_TOKEN if set, otherwise wrangler's OAuth token
 * (`npx wrangler login`). Account: CLOUDFLARE_ACCOUNT_ID if set, otherwise the token's only account.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_ARCHIVE_BUCKET_BY_SLUG, LIVE_ARCHIVE_SHARDS } from '../shared/liveArchiveFeeds.js';

const API = 'https://api.cloudflare.com/client/v4';
const WORKER_PREFIX = 'atlas-gtfs-rt-archiver-';
const DEFAULT_BUCKET = 'atlas-live';

// ---------- pure parts (unit-tested) ----------

export interface WranglerConfig { file: string; name: string | null; bucket: string | null; crons: string[] }

/** Reads the fields this audit needs from a wrangler.toml: top-level `name`, the R2 bucket, and `[triggers] crons`. */
export function parseWranglerToml(text: string, file = ''): WranglerConfig {
  let section = '';
  let name: string | null = null;
  let bucket: string | null = null;
  const crons: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/#.*$/, '').trim();
    if (!line) continue;
    const header = line.match(/^\[\[?\s*([^\]]+?)\s*\]\]?$/);
    if (header) { section = header[1]; continue; }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*=\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (section === '' && key === 'name') name = unquote(raw);
    else if (section === 'r2_buckets' && key === 'bucket_name' && bucket === null) bucket = unquote(raw);
    else if (section === 'triggers' && key === 'crons') {
      let value = raw;
      // Multi-line arrays: keep reading until the closing bracket.
      while (!value.includes(']') && i + 1 < lines.length) value += ' ' + lines[++i].replace(/#.*$/, '').trim();
      for (const m of value.matchAll(/"([^"]*)"|'([^']*)'/g)) crons.push(m[1] ?? m[2]);
    }
  }
  return { file, name, bucket, crons };
}

function unquote(raw: string): string {
  const m = raw.trim().match(/^"([^"]*)"$|^'([^']*)'$/);
  return m ? (m[1] ?? m[2]) : raw.trim();
}

export type CronStatus = 'ok' | 'mismatch' | 'no toml' | 'not deployed';
export interface CronRow { worker: string; file: string | null; live: string[] | null; toml: string[] | null; status: CronStatus }

/** Pairs live Workers with their toml (by `name`) and flags any difference in cron schedules. */
export function compareCrons(live: Record<string, string[]>, configs: WranglerConfig[]): CronRow[] {
  const byName = new Map(configs.filter(c => c.name).map(c => [c.name as string, c]));
  const names = [...new Set([...Object.keys(live), ...byName.keys()])].sort();
  return names.map(worker => {
    const cfg = byName.get(worker);
    const liveCrons = live[worker];
    if (!cfg) return { worker, file: null, live: liveCrons, toml: null, status: 'no toml' as const };
    if (!liveCrons) return { worker, file: cfg.file, live: null, toml: cfg.crons, status: 'not deployed' as const };
    const same = sameSet(liveCrons, cfg.crons);
    return { worker, file: cfg.file, live: liveCrons, toml: cfg.crons, status: same ? 'ok' as const : 'mismatch' as const };
  });
}

function sameSet(a: string[], b: string[]): boolean {
  const norm = (xs: string[]) => [...new Set(xs.map(x => x.trim().replace(/\s+/g, ' ')))].sort().join('|');
  return norm(a) === norm(b);
}

/** Prefixes each bucket should have, from the archive shard list. */
export function expectedPrefixes(): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const shard of LIVE_ARCHIVE_SHARDS) {
    for (const slug of shard.positionSlugs) (out[LIVE_ARCHIVE_BUCKET_BY_SLUG[slug] ?? DEFAULT_BUCKET] ??= new Set()).add(`positions/${slug}/`);
    for (const slug of shard.tripSlugs) (out[LIVE_ARCHIVE_BUCKET_BY_SLUG[slug] ?? DEFAULT_BUCKET] ??= new Set()).add(`${slug}/`);
  }
  return Object.fromEntries(Object.entries(out).map(([b, s]) => [b, [...s].sort()]));
}

export function formatAge(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 120) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 72 ? `${h} h` : `${Math.round(h / 24)} days`;
}

// ---------- Cloudflare API (read-only) ----------

const WRANGLER_CONFIG_PATHS = [
  join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'),
  join(homedir(), '.config/.wrangler/config/default.toml'),
  join(homedir(), '.wrangler/config/default.toml'),
];

function resolveToken(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const file = WRANGLER_CONFIG_PATHS.find(p => existsSync(p));
  if (!file) throw new Error('No Cloudflare credentials: set CLOUDFLARE_API_TOKEN, or run `npx wrangler login`.');
  const text = readFileSync(file, 'utf8');
  const token = text.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if (!token) throw new Error(`No oauth_token in ${file}: set CLOUDFLARE_API_TOKEN, or run \`npx wrangler login\`.`);
  const expires = text.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
  if (expires && Date.parse(expires) < Date.now()) {
    throw new Error(`The wrangler OAuth token expired at ${expires}. Run \`npx wrangler whoami\` (refreshes it) or \`npx wrangler login\`.`);
  }
  return token;
}

interface CfEnvelope<T> { success: boolean; errors: { message: string }[]; result: T; result_info?: { cursor?: string; is_truncated?: boolean; delimited?: string[] } }

function makeClient(token: string) {
  return async function get<T>(path: string): Promise<CfEnvelope<T>> {
    const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    const body = await res.json() as CfEnvelope<T>;
    if (!res.ok || !body.success) throw new Error(`GET ${path.replace(/\?.*/, '')}: HTTP ${res.status} ${body.errors?.map(e => e.message).join('; ') ?? ''}`);
    return body;
  };
}
type Get = ReturnType<typeof makeClient>;

async function resolveAccount(get: Get): Promise<string> {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const { result } = await get<{ id: string; name: string }[]>('/accounts');
  if (result.length !== 1) throw new Error(`Token sees ${result.length} accounts: set CLOUDFLARE_ACCOUNT_ID.`);
  return result[0].id;
}

interface R2Object { key: string; last_modified: string }

async function listDelimited(get: Get, acct: string, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ prefix, delimiter: '/', per_page: '1000', ...(cursor ? { cursor } : {}) });
    const r = await get<R2Object[]>(`/accounts/${acct}/r2/buckets/${bucket}/objects?${q}`);
    out.push(...(r.result_info?.delimited ?? []));
    cursor = r.result_info?.is_truncated ? r.result_info.cursor : undefined;
  } while (cursor);
  return out.sort();
}

/** Newest object under `prefix`, reading `<prefix><date>/` folders newest-first. Keys within a day are unix seconds, so the last key is the newest. */
async function newestObject(get: Get, acct: string, bucket: string, prefix: string): Promise<R2Object | null> {
  const days = (await listDelimited(get, acct, bucket, prefix)).reverse();
  for (const day of days) {
    let last: R2Object | null = null;
    let cursor: string | undefined;
    do {
      const q = new URLSearchParams({ prefix: day, per_page: '1000', ...(cursor ? { cursor } : {}) });
      const r = await get<R2Object[]>(`/accounts/${acct}/r2/buckets/${bucket}/objects?${q}`);
      if (r.result.length) last = r.result[r.result.length - 1];
      cursor = r.result_info?.is_truncated ? r.result_info.cursor : undefined;
    } while (cursor);
    if (last) return last;
  }
  return null;
}

interface LifecycleRule {
  id: string; enabled: boolean; conditions?: { prefix?: string };
  deleteObjectsTransition?: { condition: { type: string; maxAge?: number; date?: string } };
  abortMultipartUploadsTransition?: { condition: { maxAge?: number } };
}

function describeRule(rule: LifecycleRule): string {
  const scope = rule.conditions?.prefix ? `prefix "${rule.conditions.prefix}"` : 'all prefixes';
  const days = (s?: number) => (s === undefined ? '?' : `${Math.round(s / 86400)} days`);
  const action = rule.deleteObjectsTransition
    ? `delete after ${rule.deleteObjectsTransition.condition.maxAge !== undefined ? days(rule.deleteObjectsTransition.condition.maxAge) : rule.deleteObjectsTransition.condition.date}`
    : rule.abortMultipartUploadsTransition ? `abort multipart uploads after ${days(rule.abortMultipartUploadsTransition.condition.maxAge)}` : 'other action';
  return `${rule.enabled ? '' : '(disabled) '}${rule.id}: ${action}, ${scope}`;
}

// ---------- main ----------

async function main() {
  const get = makeClient(resolveToken());
  const acct = await resolveAccount(get);
  const here = dirname(fileURLToPath(import.meta.url));
  const workerDir = join(here, '../workers/gtfs-rt-archiver');
  const configs = readdirSync(workerDir).filter(f => /^wrangler.*\.toml$/.test(f)).sort()
    .map(f => parseWranglerToml(readFileSync(join(workerDir, f), 'utf8'), f));

  const scripts = (await get<{ id: string }[]>(`/accounts/${acct}/workers/scripts`)).result
    .map(s => s.id).filter(id => id.startsWith(WORKER_PREFIX));
  const live: Record<string, string[]> = {};
  for (const id of scripts) {
    live[id] = (await get<{ schedules: { cron: string }[] }>(`/accounts/${acct}/workers/scripts/${id}/schedules`)).result.schedules.map(s => s.cron);
  }
  const show = (xs: string[] | null) => (xs === null ? '-' : xs.length ? xs.join(', ') : 'none');
  console.log('Archiver Workers: live cron vs toml');
  for (const row of compareCrons(live, configs)) {
    const flag = row.status === 'ok' ? '' : `   <-- ${row.status.toUpperCase()}`;
    console.log(`  ${row.worker.padEnd(44)} live: ${show(row.live).padEnd(12)} toml (${row.file ?? '-'}): ${show(row.toml)}${flag}`);
  }

  const expected = expectedPrefixes();
  const now = Date.now();
  for (const bucket of Object.keys(expected).sort()) {
    console.log(`\nBucket ${bucket}: newest object per prefix`);
    const top = await listDelimited(get, acct, bucket, '');
    const found = [
      ...top.filter(p => p !== 'positions/'),
      ...(top.includes('positions/') ? await listDelimited(get, acct, bucket, 'positions/') : []),
    ];
    for (const prefix of [...new Set([...found, ...expected[bucket]])].sort()) {
      const obj = found.includes(prefix) ? await newestObject(get, acct, bucket, prefix) : null;
      const note = expected[bucket].includes(prefix) ? '' : '  (not in the archive config)';
      console.log(obj
        ? `  ${prefix.padEnd(24)} ${obj.key.slice(prefix.length).padEnd(28)} ${formatAge(now - Date.parse(obj.last_modified))} old${note}`
        : `  ${prefix.padEnd(24)} none${note}`);
    }
    console.log(`Bucket ${bucket}: lifecycle rules`);
    const rules = (await get<{ rules: LifecycleRule[] }>(`/accounts/${acct}/r2/buckets/${bucket}/lifecycle`)).result.rules;
    for (const rule of rules) console.log(`  ${describeRule(rule)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
