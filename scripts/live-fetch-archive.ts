/**
 * Copy archived vehicle positions from R2 (atlas-live) into the local Live data folder, one file per route and day,
 * for every route at once. Each snapshot holds the whole network, so keeping every route costs the same download as
 * keeping one (the old one-route fetcher in ../_live-data/fetch-archive.mts dropped the rest).
 *
 *   npx tsx scripts/live-fetch-archive.ts --days 2026-10-01,2026-10-02 [--routes all|504,505] [--agency ttc] [--concurrency 12] [--force]
 *   npx tsx scripts/live-fetch-archive.ts --from 2026-09-30 --to 2026-10-14
 *
 * Writes <LIVE_DATA or ../_live-data>/archive/<route>-<day>.jsonl, the format scripts/live-segment-delay.ts reads:
 * one line per snapshot, {"ts": capturedAt, "v": [[vehicleId, tripId, lat, lon, positionTime, bearing, speed], ...]}.
 * A day is skipped when its marker (archive/.<agency>-<day>.all) exists, unless --force. Read-only on R2. Needs the R2
 * keys in .env.local. Heavy on the network (about 1,400 snapshots a day): run it during the day, one copy at a time.
 */
import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { liveArchiveClient } from '../shared/liveArchive';
import { mapWithConcurrency } from '../local-api/concurrency';

const BUCKET = 'atlas-live';

/** Dates from --days, or every date from --from to --to (inclusive). */
export function datesFromArgs(args: Record<string, string | undefined>): string[] {
  if (args.days) return args.days.split(',').map(d => d.trim()).filter(Boolean);
  if (!args.from || !args.to) return [];
  const out: string[] = [];
  for (let t = Date.parse(`${args.from}T12:00:00Z`); t <= Date.parse(`${args.to}T12:00:00Z`); t += 86400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

type Vehicle = { id: string; r: string; tripId?: string; lat: number; lon: number; t?: number | null; brg?: number | null; spd?: number | null };

/** One snapshot split by route: route -> its line for the day file. */
export function splitSnapshot(snap: { capturedAt?: number; ts?: number; vehicles?: Vehicle[] }, keep: (route: string) => boolean): Map<string, string> {
  const ts = snap.capturedAt ?? snap.ts;
  const byRoute = new Map<string, unknown[][]>();
  for (const x of snap.vehicles ?? []) {
    if (!x?.r || !keep(x.r)) continue;
    const list = byRoute.get(x.r) ?? [];
    list.push([x.id, x.tripId, x.lat, x.lon, x.t ?? ts, x.brg, x.spd]);
    byRoute.set(x.r, list);
  }
  return new Map([...byRoute].map(([r, v]) => [r, JSON.stringify({ ts, v })]));
}

async function main() {
  config({ path: '.env.local', quiet: true });
  const argv = process.argv.slice(2);
  const args: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] == null ? 'true' : argv[++i];
  const agency = args.agency ?? 'ttc';
  const days = datesFromArgs(args);
  if (!days.length) { console.error('live-fetch-archive: give --days d1,d2 or --from d --to d'); process.exit(1); }
  const only = !args.routes || args.routes === 'all' ? null : new Set(args.routes.split(','));
  const keep = (r: string) => !only || only.has(r);
  const concurrency = Number(args.concurrency ?? 12);
  const client = liveArchiveClient();
  if (!client) { console.error('live-fetch-archive: no R2 keys in .env.local'); process.exit(1); }
  const dir = resolve(process.env.LIVE_DATA ?? '../_live-data', 'archive');
  mkdirSync(dir, { recursive: true });

  for (const day of days) {
    const marker = resolve(dir, `.${agency}-${day}.all`);
    if (only == null && existsSync(marker) && args.force !== 'true') { console.log('skip', day); continue; }
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
          return splitSnapshot(JSON.parse(body), keep);
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
    for (const [route, l] of lines) writeFileSync(resolve(dir, `${route}-${day}.jsonl`), l.join('\n'));
    if (only == null && failed === 0) writeFileSync(marker, new Date().toISOString());
    console.log(day, keys.length, 'snapshots,', lines.size, 'routes', failed ? `, ${failed} snapshots failed (day not marked done)` : '', new Date().toISOString());
  }
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-fetch-archive.ts')) main();
