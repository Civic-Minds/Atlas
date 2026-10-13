import { r2ListArchiveObjects, r2PutArchive, rawFeedArchiveKey } from './r2.js';

export interface ArchiveIfMissingDeps {
  listArchive: (prefix: string) => Promise<Array<{ key: string }>>;
  putArchive: (key: string, body: Buffer) => Promise<unknown>;
}

const r2Deps: ArchiveIfMissingDeps = {
  listArchive: prefix => r2ListArchiveObjects(prefix),
  putArchive: (key, body) => r2PutArchive(key, body, 'application/zip'),
};

/**
 * Refresh archives a raw zip only when it processes a changed feed, so an agency whose live
 * feed was published without an archive copy, and has not changed since, never gets one:
 * reprocess-derived-artifacts then cannot rebuild it (#612: 64 agencies with no archive in the
 * 2026-10-13 rebuild, and cascades-east, las-cruces, san-angelo and seattle-monorail whose
 * archive holds only older schedules). When refresh skips an unchanged feed, archive it unless
 * a zip for the same schedule label (service end date, else feed version) is already there.
 * The skipped feed matches the live schedule identity, so it is the zip the live artifacts came
 * from; matching on the label rather than the content hash keeps feeds that are rebuilt
 * byte-differently every download from adding a copy each week. Returns the key written, or null.
 */
export async function archiveUnchangedFeedIfMissing(
  slug: string,
  buf: Buffer,
  feedExpiry: string | null,
  feedVersion: string | null,
  deps: ArchiveIfMissingDeps = r2Deps,
): Promise<string | null> {
  const prefix = `gtfs/archive/${slug}/`;
  const stem = rawFeedArchiveKey(feedExpiry, feedVersion, buf);
  const label = stem.slice(0, stem.lastIndexOf('-'));
  const archived = (await deps.listArchive(prefix))
    .map(obj => obj.key.slice(prefix.length))
    .filter(name => name.endsWith('.zip'))
    .some(name => name === `${label}.zip` || name.startsWith(`${label}-`));
  if (archived) return null;
  const key = `${prefix}${stem}.zip`;
  await deps.putArchive(key, buf);
  return key;
}

/**
 * archiveUnchangedFeedIfMissing for refresh's skip path: an archive failure is logged as a
 * warning and never fails the agency, which stays "skipped" with its live data and metadata.
 */
export async function tryArchiveUnchangedFeed(
  slug: string,
  buf: Buffer,
  feedExpiry: string | null,
  feedVersion: string | null,
  log: (message: string) => void,
  deps?: ArchiveIfMissingDeps,
): Promise<string | null> {
  try {
    const key = await archiveUnchangedFeedIfMissing(slug, buf, feedExpiry, feedVersion, deps);
    if (key) log(`\n  ${slug.padEnd(12)} ... archived the unchanged live feed (${key}), its schedule was not archived\n`);
    return key;
  } catch (error) {
    log(`\n  [warn] ${slug}: could not archive the unchanged live feed (${error instanceof Error ? error.message : String(error)}); kept as skipped\n`);
    return null;
  }
}
