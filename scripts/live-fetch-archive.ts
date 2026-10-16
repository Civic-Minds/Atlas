/**
 * Copy archived vehicle positions from R2 (atlas-live) into the local Live data folder, one file per route and day,
 * for every route at once. Each snapshot holds the whole network, so keeping every route costs the same download as
 * keeping one (the old one-route fetcher in ../_live-data/fetch-archive.mts dropped the rest).
 *
 *   npx tsx scripts/live-fetch-archive.ts --days 2026-10-01,2026-10-02 [--routes all|504,505] [--agency ttc] [--concurrency 12] [--force]
 *   npx tsx scripts/live-fetch-archive.ts --from 2026-09-30 --to 2026-10-14
 *   npx tsx scripts/live-fetch-archive.ts --days 8 --out <dir> [--routes 501,503] [--prune]
 *
 * --days N (a bare number) means the last N Toronto service dates before today. Archive folders are UTC dates and a
 * service date runs to 4 a.m. Toronto the next morning (past midnight UTC), so this fetches the UTC folders from N
 * days ago up to today; today's folder is cut at the end of yesterday's service and never marked done, so the next
 * run fetches it again in full. --prune deletes day files outside that window (the nightly job's cache stays small).
 *
 * Writes <--out, or LIVE_DATA/archive, or ../_live-data/archive>/<route>-<day>.jsonl, the format scripts/live-segment-delay.ts reads:
 * one line per snapshot, {"ts": capturedAt, "v": [[vehicleId, tripId, lat, lon, positionTime, bearing, speed], ...]}.
 * A day is skipped when its marker (archive/.<agency>-<day>.all, or .<agency>-<day>.<routes hash> for a --routes
 * list) exists, unless --force. A marker is written only for a complete UTC day with no failed snapshots. Read-only on R2. Needs the R2
 * keys in .env.local. Heavy on the network (about 1,400 snapshots a day): run it during the day, one copy at a time.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { liveArchiveClient } from '../shared/liveArchive';
import { mapWithConcurrency } from '../local-api/concurrency';

const BUCKET = 'atlas-live';

/** Toronto calendar date (YYYY-MM-DD) at an instant. */
export function torontoDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Epoch seconds of 4 a.m. Toronto on a date, the end of the previous service date (the analysis's day boundary). */
export function torontoServiceStart(day: string): number {
  // 4 a.m. Toronto is 08:00 or 09:00 UTC; find the hour whose Toronto wall clock reads 04 on that date.
  for (const utcHour of [8, 9]) {
    const t = Date.parse(`${day}T0${utcHour}:00:00Z`);
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Toronto', hour: '2-digit', hourCycle: 'h23' }).format(t);
    if (hour === '04' && torontoDate(t) === day) return t / 1000;
  }
  throw new Error(`no 4 a.m. Toronto on ${day}`);
}

/**
 * The UTC archive folders that cover the last `n` Toronto service dates before the Toronto date of `nowMs`: from n days
 * back to today. The last one (today) is still filling, so it carries a cut: keep snapshots before 4 a.m. Toronto today.
 */
export function serviceWindowFolders(n: number, nowMs: number): { day: string; cutBefore: number | null }[] {
  const today = torontoDate(nowMs);
  const out: { day: string; cutBefore: number | null }[] = [];
  for (let i = n; i >= 1; i--) out.push({ day: addDays(today, -i), cutBefore: null });
  out.push({ day: today, cutBefore: torontoServiceStart(today) });
  return out;
}

/** Dates from --days, or every date from --from to --to (inclusive). */
export function datesFromArgs(args: Record<string, string | undefined>): string[] {
  if (args.days && /^\d+$/.test(args.days)) return serviceWindowFolders(Number(args.days), Date.now()).map(f => f.day);
  if (args.days) return args.days.split(',').map(d => d.trim()).filter(Boolean);
  if (!args.from || !args.to) return [];
  const out: string[] = [];
  for (let t = Date.parse(`${args.from}T12:00:00Z`); t <= Date.parse(`${args.to}T12:00:00Z`); t += 86400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Letters, digits, dot, dash and underscore only, so a feed value can never reach outside the archive folder. A value
 * that had to change gets a short hash of the original, so "1/2" and "1_2" never land in the same file.
 */
export function fileSafe(s: string): string {
  const safe = s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return safe === s ? s : `${safe}~${createHash('sha1').update(s).digest('hex').slice(0, 6)}`;
}

type Vehicle = { id: string; r: string; tripId?: string; lat: number; lon: number; t?: number | null; brg?: number | null; spd?: number | null };

/**
 * One snapshot split by route: route -> its line for the day file. Routes in `always` get a line even with no vehicles
 * (as the old one-route fetcher wrote), so the analysis sees every snapshot time and does not read quiet spells as
 * feed outages. Snapshots at or after `cutBefore` (epoch seconds) are dropped.
 */
export function splitSnapshot(snap: { capturedAt?: number; ts?: number; vehicles?: Vehicle[] }, keep: (route: string) => boolean, cutBefore: number | null = null, always: Iterable<string> = []): Map<string, string> {
  const ts = snap.capturedAt ?? snap.ts;
  if (cutBefore != null && (ts == null || ts >= cutBefore)) return new Map();
  const byRoute = new Map<string, unknown[][]>();
  for (const r of always) byRoute.set(r, []);
  for (const x of snap.vehicles ?? []) {
    if (!x?.r || !keep(x.r)) continue;
    const list = byRoute.get(x.r) ?? [];
    list.push([x.id, x.tripId, x.lat, x.lon, x.t ?? ts, x.brg, x.spd]);
    byRoute.set(x.r, list);
  }
  return new Map([...byRoute].map(([r, v]) => [r, JSON.stringify({ ts, v })]));
}

async function main() {
  await import('../pipeline/loadEnv.js');
  const argv = process.argv.slice(2);
  const args: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] == null ? 'true' : argv[++i];
  const agency = args.agency ?? 'ttc';
  const now = Date.now();
  const windowed = !!args.days && /^\d+$/.test(args.days);
  const folders = windowed ? serviceWindowFolders(Number(args.days), now) : datesFromArgs(args).map(day => ({ day, cutBefore: null as number | null }));
  const days = folders.map(f => f.day);
  if (!days.length) { console.error('live-fetch-archive: give --days d1,d2 or --from d --to d'); process.exit(1); }
  const only = !args.routes || args.routes === 'all' ? null : new Set(args.routes.split(','));
  const keep = (r: string) => !only || only.has(r);
  const concurrency = Number(args.concurrency ?? 12);
  const client = liveArchiveClient();
  if (!client) { console.error('live-fetch-archive: no R2 keys in .env.local'); process.exit(1); }
  const dir = args.out ? resolve(args.out) : resolve(process.env.LIVE_DATA ?? '../_live-data', 'archive');
  mkdirSync(dir, { recursive: true });
  const routeSetTag = only ? createHash('sha1').update([...only].sort().join(',')).digest('hex').slice(0, 8) : 'all';
  const todayUtc = new Date(now).toISOString().slice(0, 10);

  if (args.prune === 'true' && windowed) {
    const keepDays = new Set(days);
    for (const f of readdirSync(dir)) {
      const m = f.match(/(\d{4}-\d{2}-\d{2})(\.jsonl|\.[^.]+)$/);
      if (m && !keepDays.has(m[1])) { rmSync(resolve(dir, f)); console.log('prune', f); }
    }
  }

  for (const { day, cutBefore } of folders) {
    const allMarker = resolve(dir, `.${fileSafe(agency)}-${fileSafe(day)}.all`);
    const marker = resolve(dir, `.${fileSafe(agency)}-${fileSafe(day)}.${routeSetTag}`);
    // With a --routes list, a day whose files are all already there is done too (e.g. fetched by the old fetcher).
    const filesThere = !!only && [...only].every(r => existsSync(resolve(dir, `${fileSafe(r)}-${fileSafe(day)}.jsonl`)));
    if (args.force !== 'true' && cutBefore == null && (existsSync(allMarker) || existsSync(marker) || filesThere)) { console.log('skip', day); continue; }
    const started = Date.now();
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const r = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `positions/${agency}/${day}/`, ContinuationToken: token }));
      for (const o of r.Contents ?? []) keys.push(o.Key!);
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    keys.sort();
    const parts = await mapWithConcurrency(keys, concurrency, async key => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const body = await (await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))).Body!.transformToString();
          return splitSnapshot(JSON.parse(body), keep, cutBefore, only ?? []);
        } catch { /* retry */ }
      }
      return null;
    });
    const lines = new Map<string, string[]>();
    let failed = 0;
    for (const p of parts) {
      if (!p) { failed++; continue; }
      for (const [route, line] of p) { const l = lines.get(route) ?? []; l.push(line); lines.set(route, l); }
    }
    // Route ids and the day come from the feed and the command line: keep only safe characters in file names.
    for (const [route, l] of lines) { const safe = fileSafe(route); if (safe) writeFileSync(resolve(dir, `${safe}-${fileSafe(day)}.jsonl`), l.join('\n')); }
    // Only a finished UTC day is marked done; a cut or still-filling folder is fetched again next time.
    const complete = cutBefore == null && day < todayUtc && failed === 0;
    if (complete) writeFileSync(marker, new Date().toISOString());
    const note = failed ? `, ${failed} snapshots failed (day not marked done)` : cutBefore != null ? ' (cut at 4 a.m. Toronto, not marked done)' : '';
    console.log(day, keys.length, 'snapshots,', lines.size, 'routes', note, `${Math.round((Date.now() - started) / 1000)}s`);
  }
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-fetch-archive.ts')) main();
