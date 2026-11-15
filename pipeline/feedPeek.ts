/**
 * Download and peek a feed without processing it, and refresh's choice among an agency's sources.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { effectiveFeedExpiry } from './feedFreshness.js';
import type { FeedCandidate } from './feedSourceCandidates.js';
import { feedZipProblem } from './feedZipCheck.js';
import { parseCsv } from './parseGtfs.js';
import { isFeedExpired, shouldReplaceExpiredFeed } from './refreshMeta.js';

/**
 * #1423: a key for a zip's contents, not its bytes: sha256 (first 16 hex) of its file entries' sorted
 * (name, CRC32, uncompressed size), read from the central directory without unpacking. Some publishers
 * re-zip the same files on every download (zenbus, passio3, ridesystems), so the byte hash changes weekly
 * with no schedule change. Null when the central directory can't be read (not a zip, ZIP64 sizes).
 */
export function zipContentKey(buf: Buffer): string | null {
  const EOCD = 0x06054b50;
  const CDH = 0x02014b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) return null;
  const entries: string[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDH) return null;
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    if (size === 0xffffffff || p + 46 + nameLen > buf.length) return null;
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (!name.endsWith('/')) entries.push(`${name}\t${crc}\t${size}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (entries.length === 0) return null;
  return createHash('sha256').update(entries.sort().join('\n')).digest('hex').slice(0, 16);
}

export async function peekFeedInfo(buf: Buffer): Promise<{ feedExpiry: string | null; feedVersion: string | null }> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const findEntry = (name: string) => zip.file(name) ?? zip.file(
      Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? '',
    );
    const readRows = async (name: string) => {
      const entry = findEntry(name);
      if (!entry) return [] as Array<Record<string, string>>;
      return parseCsv<Record<string, string>>(await entry.async('text'));
    };
    const feedInfoRows = await readRows('feed_info.txt');
    const row = feedInfoRows[0] ?? {};
    const calendarRows = await readRows('calendar.txt');
    const calendarDateRows = await readRows('calendar_dates.txt');
    return {
      feedExpiry: effectiveFeedExpiry({
        feedInfoEnd: row.feed_end_date,
        calendarEnds: calendarRows.map(calendar => calendar.end_date),
        calendarDates: calendarDateRows,
      }),
      feedVersion: row.feed_version || null,
    };
  } catch {
    return { feedExpiry: null, feedVersion: null };
  }
}

export async function downloadFeed(url: string): Promise<Buffer> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'atlas-frequency-map/1.0' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (fetchErr) {
    // Some agency hosts (e.g. NFTA) have TLS chains Node rejects; curl uses system trust store.
    try {
      return execFileSync('curl', ['-fsSL', url], {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120_000,
      });
    } catch {
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
    }
  }
}

export interface PickedFeedSource {
  buf: Buffer | null;
  peekedExpiry: string | null;
  peekedVersion: string | null;
  selectedCandidate: FeedCandidate | null;
  firstCandidateError: Error | null;
}

/**
 * Refresh's source choice: the first source that is a usable GTFS zip (#1251: an empty or invalid one is skipped),
 * unless it has ended and a later source is dated and current.
 */
export async function pickFeedSource(
  feedCandidates: FeedCandidate[],
  opts: { download: (url: string) => Promise<Buffer>; expiryToday: string; log: (msg: string) => void },
): Promise<PickedFeedSource> {
  let buf: Buffer | null = null;
  let peekedExpiry: string | null = null;
  let peekedVersion: string | null = null;
  let selectedCandidate: FeedCandidate | null = null;
  let firstCandidateError: Error | null = null;
  for (const candidate of feedCandidates) {
    try {
      const candidateBuf = await opts.download(candidate.url);
      // #1251: an empty or broken zip is no source: try the next one rather than keep it as the first usable.
      const problem = await feedZipProblem(candidateBuf);
      if (problem) throw new Error(problem);
      const metadata = await peekFeedInfo(candidateBuf);
      // Keep the first usable source unless a dated current candidate is found.
      // An expired primary must yield to a current configured or derived backup,
      // but an undated backup is not enough evidence to replace known data.
      if (!buf) {
        buf = candidateBuf;
        peekedExpiry = metadata.feedExpiry;
        peekedVersion = metadata.feedVersion;
        selectedCandidate = candidate;
        if (!isFeedExpired(metadata.feedExpiry, opts.expiryToday)) break;
      } else if (shouldReplaceExpiredFeed({
        selectedExpiry: peekedExpiry,
        candidateExpiry: metadata.feedExpiry,
        todayYmd: opts.expiryToday,
      })) {
        buf = candidateBuf;
        peekedExpiry = metadata.feedExpiry;
        peekedVersion = metadata.feedVersion;
        selectedCandidate = candidate;
        break;
      }
      opts.log(`\n  [warn] ${candidate.kind} feed expired (${metadata.feedExpiry ?? 'unknown'}) — trying next source\n`);
    } catch (error) {
      firstCandidateError ??= error instanceof Error ? error : new Error(String(error));
      opts.log(`\n  [warn] ${candidate.kind} feed failed (${error instanceof Error ? error.message : String(error)}) — trying next source\n`);
    }
  }
  return { buf, peekedExpiry, peekedVersion, selectedCandidate, firstCandidateError };
}

/**
 * CIV-1223: one hash for the zips a refresh reads (the main feed, then each supplemental in config order), so a
 * set the release gate refused is recognised when the same zips are served again.
 */
export function feedSetSha256(bufs: readonly Buffer[]): string {
  const hash = createHash('sha256');
  for (const buf of bufs) hash.update(createHash('sha256').update(buf).digest('hex'));
  return hash.digest('hex');
}
