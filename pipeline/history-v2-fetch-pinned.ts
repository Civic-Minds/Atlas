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
 * one feed in force on the sidecar's refDate. Uses only list and get; nothing is ever written to R2.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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

export type ZipSource = { kind: 'r2'; key: string; why: string } | { kind: 'url'; url: string; why: string };

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
    if (byName && byName.startDate <= refDate && refDate <= byName.endDate) return { source: { kind: 'url', url: byName.url, why: 'MBTA archive file named by the period key' }, candidates: [byName.url] };
    const byEnd = index.filter(f => f.endDate === periodKey && f.startDate <= refDate && refDate <= f.endDate);
    if (byEnd.length === 1) return { source: { kind: 'url', url: byEnd[0].url, why: 'MBTA archive feed ending on the period key, in force on refDate' }, candidates: byEnd.map(f => f.url) };
    const inForce = index.filter(f => f.startDate <= refDate && refDate <= f.endDate);
    if (inForce.length === 1) return { source: { kind: 'url', url: inForce[0].url, why: 'the one MBTA archive feed in force on refDate' }, candidates: [inForce[0].url] };
    if (inForce.length > 1) return { source: null, reason: `${inForce.length} MBTA archive feeds are in force on ${refDate}; none is named by or ends on ${periodKey}`, candidates: inForce.map(f => f.url) };
  }
  return { source: null, reason: `no archived zip for period ${periodKey}${index ? ' and no MBTA archive feed in force on ' + refDate : ''}`, candidates: [] };
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

  const sources: Array<Record<string, unknown>> = [];
  for (const key of sidecarKeys) {
    const periodKey = key.slice(key.lastIndexOf('/') + 1, -'.json'.length);
    const body = await r2.r2GetArchive(key);
    if (body == null) { sources.push({ periodKey, error: 'listed but missing' }); continue; }
    writeFileSync(resolve(pubDir, `${periodKey}.json`), body);
    const sc = JSON.parse(body) as { refDate: string; feedSha256?: string; refDateQuality?: unknown };
    const pick = pickZipSource(periodKey, sc.refDate, sc.feedSha256, archiveKeys, index);
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
