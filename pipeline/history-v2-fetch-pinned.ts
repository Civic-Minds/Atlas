#!/usr/bin/env npx tsx
/**
 * CIV-1430: download, READ-ONLY, what a pinned History v2 rebuild needs for one agency:
 *
 *   npx tsx pipeline/history-v2-fetch-pinned.ts --slug mbta --out <dir>
 *
 *   <dir>/published/history-v2/{slug}/{periodKey}.json   every published sidecar (private archive bucket)
 *   <dir>/zips/{periodKey}.zip                           the feed each was built from
 *   <dir>/sources.json                                   which zip each period got, or why none
 *
 * A period's zip is, in order: the archived zip whose content hash the sidecar records (feedSha256), an archived
 * zip gtfs/archive/{slug}/ named by the period key, then (MBTA only) MBTA's own archive
 * (cdn.mbta.com/archive/archived_feeds.txt): the file named by the period key, the feed ending on it, then the
 * one feed in force on the sidecar's refDate; then (CIV-1862, any agency whose config names an MDB feed id, with
 * MDB_REFRESH_TOKEN set) the Mobility Database dataset in force on refDate (pickMdbSource). Uses only list and
 * get; nothing is ever written to R2.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isEntryPoint, parseFlags } from './historyPublishLib.js';

export interface ArchiveFeed { startDate: string; endDate: string; version: string; url: string }

export function parseMbtaArchiveIndex(text: string): ArchiveFeed[] {
  return text.trim().split(/\r?\n/).slice(1).flatMap(line => {
    const fields = line.match(/(?:"([^"]*)"|([^,]*))(?:,|$)/g)?.map(f => f.replace(/,$/, '').replace(/^"|"$/g, '')) ?? [];
    if (fields.length < 4 || !/^\d{8}$/.test(fields[0])) return [];
    return [{ startDate: fields[0], endDate: fields[1], version: fields[2], url: fields[3] }];
  });
}

/** One Mobility Database dataset (GET /v1/gtfs_feeds/{id}/datasets). Dates are YYYY-MM-DD. */
export interface MdbDataset { id: string; downloaded_at: string; hosted_url: string; hash?: string; service_date_range_start?: string; service_date_range_end?: string; feed_start_date?: string; feed_end_date?: string }

/** The MDB feed id (mdb-NNN) an agency config names, from mdbFeedUrl or an MDB feedUrl. */
export function mdbFeedIdOf(agency: { mdbFeedUrl?: string; feedUrl?: string }): string | null {
  for (const url of [agency.mdbFeedUrl, agency.feedUrl]) {
    const m = url?.match(/files\.mobilitydatabase\.org\/(mdb-\d+)\//);
    if (m) return m[1];
  }
  return null;
}

/**
 * CIV-1862: the Mobility Database's stored datasets as archive feeds, one per distinct file (same hash kept once,
 * the earliest download), with the service window each dataset states. Datasets with no stated window are left out.
 */
export function mdbDatasetsAsArchive(datasets: readonly MdbDataset[]): ArchiveFeed[] {
  const ymd = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).replace(/-/g, '') : null);
  const byHash = new Map<string, MdbDataset>();
  for (const d of [...datasets].sort((a, b) => a.downloaded_at.localeCompare(b.downloaded_at))) {
    const key = d.hash ?? d.id;
    if (!byHash.has(key)) byHash.set(key, d);
  }
  return [...byHash.values()].flatMap(d => {
    const start = ymd(d.service_date_range_start ?? d.feed_start_date);
    const end = ymd(d.service_date_range_end ?? d.feed_end_date);
    if (!start || !end || !d.hosted_url) return [];
    return [{ startDate: start, endDate: end, version: `${d.id} (downloaded ${d.downloaded_at.slice(0, 10)})`, url: d.hosted_url }];
  });
}

/**
 * CIV-1862: a period's feed from the Mobility Database, when the archive has none. The feeds in force on refDate;
 * with several, the one downloaded last on or before refDate (the file a run on that date would have read), else
 * the earliest after it. The pinned rebuild's per-route match decides which routes it may flag, so a near miss
 * flags nothing.
 */
export function pickMdbSource(refDate: string, feeds: readonly ArchiveFeed[]): { source: ZipSource | null; reason?: string; candidates: string[] } {
  const inForce = feeds.filter(f => f.startDate <= refDate && refDate <= f.endDate);
  if (inForce.length === 0) return { source: null, reason: `no Mobility Database dataset in force on ${refDate}`, candidates: [] };
  const downloaded = (f: ArchiveFeed) => (f.version.match(/downloaded (\d{4})-(\d{2})-(\d{2})/)?.slice(1).join('') ?? '');
  const before = inForce.filter(f => downloaded(f) <= refDate).sort((a, b) => downloaded(b).localeCompare(downloaded(a)));
  const after = inForce.filter(f => downloaded(f) > refDate).sort((a, b) => downloaded(a).localeCompare(downloaded(b)));
  const pick = before[0] ?? after[0];
  return {
    source: { kind: 'url', url: pick.url, why: `Mobility Database ${pick.version}, in force ${pick.startDate}-${pick.endDate}${inForce.length > 1 ? ` (${before[0] ? 'last downloaded on or before' : 'first downloaded after'} refDate, of ${inForce.length} in force)` : ''}` },
    candidates: inForce.map(f => f.url),
  };
}

export type ZipSource ={ kind: 'r2'; key: string; why: string } | { kind: 'url'; url: string; why: string };

/** Pick a period's zip from the archive keys and (MBTA) the official index. Null with a reason when none fits. */
export function pickZipSource(
  periodKey: string, refDate: string, feedSha256: string | undefined, archiveKeys: string[], index: ArchiveFeed[] | null,
): { source: ZipSource | null; reason?: string; candidates: string[] } {
  const zips = archiveKeys.filter(k => k.endsWith('.zip')).sort();
  const stem = (k: string) => k.slice(k.lastIndexOf('/') + 1, -'.zip'.length);
  if (feedSha256) {
    const hit = zips.find(k => stem(k).endsWith(`-${feedSha256.slice(0, 16)}`));
    if (hit) return { source: { kind: 'r2', key: hit, why: 'content hash matches the sidecar feedSha256' }, candidates: [hit] };
  }
  const named = zips.filter(k => stem(k) === periodKey || stem(k).startsWith(`${periodKey}-`));
  if (named.length > 0) return { source: { kind: 'r2', key: named[0], why: `archived zip named by the period key${named.length > 1 ? ` (first of ${named.length})` : ''}` }, candidates: named };
  if (index) {
    const base = (u: string) => u.slice(u.lastIndexOf('/') + 1);
    const byName = index.find(f => base(f.url) === `${periodKey}.zip`);
    // The backfill named each zip by its archive file, so the file named by the period key is the source even when
    // the sidecar's refDate falls after the index's listed end date (the feed's own calendar runs longer).
    if (byName) return { source: { kind: 'url', url: byName.url, why: `MBTA archive file named by the period key (listed ${byName.startDate}-${byName.endDate})` }, candidates: [byName.url] };
    const byEnd = index.filter(f => f.endDate === periodKey && f.startDate <= refDate && refDate <= f.endDate);
    if (byEnd.length === 1) return { source: { kind: 'url', url: byEnd[0].url, why: 'MBTA archive feed ending on the period key, in force on refDate' }, candidates: byEnd.map(f => f.url) };
    const inForce = index.filter(f => f.startDate <= refDate && refDate <= f.endDate);
    if (inForce.length === 1) return { source: { kind: 'url', url: inForce[0].url, why: 'the one MBTA archive feed in force on refDate' }, candidates: [inForce[0].url] };
    if (inForce.length > 1) return { source: null, reason: `${inForce.length} MBTA archive feeds are in force on ${refDate}; none is named by or ends on ${periodKey}`, candidates: inForce.map(f => f.url) };
  }
  return { source: null, reason: `no archived zip for period ${periodKey}${index ? ' and no MBTA archive feed in force on ' + refDate : ''}`, candidates: [] };
}

const MDB_API = 'https://api.mobilitydatabase.org/v1';

/** Every stored dataset of one MDB feed (read-only API calls). */
async function fetchMdbDatasets(feedId: string, refreshToken: string): Promise<MdbDataset[]> {
  const tok = await fetch(`${MDB_API}/tokens`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }) });
  if (!tok.ok) throw new Error(`token exchange: HTTP ${tok.status}`);
  const { access_token } = await tok.json() as { access_token: string };
  const all: MdbDataset[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${MDB_API}/gtfs_feeds/${feedId}/datasets?limit=100&offset=${offset}`, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!res.ok) throw new Error(`datasets: HTTP ${res.status}`);
    const page = await res.json() as MdbDataset[];
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < 100) break;
  }
  return all;
}

async function main(): Promise<void> {
  await import('./loadEnv.js');
  const { values } = parseFlags(process.argv.slice(2), ['--slug', '--out'], []);
  const slug = values['--slug'];
  const out = values['--out'];
  if (!slug || !out || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Usage: history-v2-fetch-pinned.ts --slug <slug> --out <dir>');
  const r2 = await import('./r2.js');
  const pubDir = resolve(out, 'published', 'history-v2', slug);
  const zipDir = resolve(out, 'zips');
  mkdirSync(pubDir, { recursive: true });
  mkdirSync(zipDir, { recursive: true });

  const sidecarKeys = (await r2.r2ListArchive(`history-v2/${slug}/`)).filter(k => k.endsWith('.json')).sort();
  const archiveKeys = await r2.r2ListArchive(`gtfs/archive/${slug}/`);
  console.log(`${slug}: ${sidecarKeys.length} published sidecar(s), ${archiveKeys.length} archived object(s)`);
  let index: ArchiveFeed[] | null = null;
  if (slug === 'mbta') {
    const res = await fetch('https://cdn.mbta.com/archive/archived_feeds.txt');
    if (!res.ok) throw new Error(`MBTA archive index: HTTP ${res.status}`);
    index = parseMbtaArchiveIndex(await res.text());
    console.log(`MBTA archive index: ${index.length} feeds`);
  }
  // CIV-1862: the Mobility Database's stored datasets, read when the archive (and MBTA's index) has no feed.
  let mdbFeeds: ArchiveFeed[] | null = null;
  let mdbNote = '';
  const agencyConfig = JSON.parse(readFileSync(resolve('config/agencies', `${slug}.json`), 'utf8')) as { mdbFeedUrl?: string; feedUrl?: string };
  const mdbId = mdbFeedIdOf(agencyConfig);
  if (!mdbId) mdbNote = 'no Mobility Database feed id in the agency config';
  else if (!process.env.MDB_REFRESH_TOKEN) mdbNote = 'MDB_REFRESH_TOKEN not set';
  else {
    try {
      mdbFeeds = mdbDatasetsAsArchive(await fetchMdbDatasets(mdbId, process.env.MDB_REFRESH_TOKEN));
      console.log(`Mobility Database ${mdbId}: ${mdbFeeds.length} distinct dataset(s) with a service window`);
    } catch (error) {
      mdbNote = `Mobility Database ${mdbId}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (mdbNote) console.log(`Mobility Database not searched: ${mdbNote}`);

  const sources: Array<Record<string, unknown>> = [];
  for (const key of sidecarKeys) {
    const periodKey = key.slice(key.lastIndexOf('/') + 1, -'.json'.length);
    const body = await r2.r2GetArchive(key);
    if (body == null) { sources.push({ periodKey, error: 'listed but missing' }); continue; }
    writeFileSync(resolve(pubDir, `${periodKey}.json`), body);
    const sc = JSON.parse(body) as { refDate: string; feedSha256?: string; refDateQuality?: unknown };
    let pick = pickZipSource(periodKey, sc.refDate, sc.feedSha256, archiveKeys, index);
    if (!pick.source && mdbFeeds) {
      const mdb = pickMdbSource(sc.refDate, mdbFeeds);
      pick = mdb.source ? mdb : { ...mdb, reason: `${pick.reason}; ${mdb.reason}` };
    } else if (!pick.source && mdbNote) pick = { ...pick, reason: `${pick.reason}; ${mdbNote}` };
    const row: Record<string, unknown> = { periodKey, refDate: sc.refDate, refDateQuality: sc.refDateQuality ?? null, candidates: pick.candidates };
    if (!pick.source) { sources.push({ ...row, zip: null, reason: pick.reason }); console.log(`${periodKey}: NO ZIP (${pick.reason})`); continue; }
    try {
      let buf: Buffer | null;
      if (pick.source.kind === 'r2') buf = await r2.r2GetArchiveBuffer(pick.source.key);
      else {
        const res = await fetch(pick.source.url);
        buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
      }
      if (!buf) throw new Error('download returned nothing');
      writeFileSync(resolve(zipDir, `${periodKey}.zip`), buf);
      sources.push({ ...row, zip: pick.source, bytes: buf.length });
      console.log(`${periodKey}: ${pick.source.kind === 'r2' ? pick.source.key : pick.source.url} (${pick.source.why}, ${buf.length} bytes)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sources.push({ ...row, zip: null, reason: `download failed: ${message}` });
      console.log(`${periodKey}: download failed: ${message}`);
    }
  }
  writeFileSync(resolve(out, 'sources.json'), JSON.stringify({ slug, sidecars: sidecarKeys.length, archiveKeys: archiveKeys.filter(k => k.endsWith('.zip')).sort(), periods: sources }, null, 2));
}

if (isEntryPoint(import.meta.url)) main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
