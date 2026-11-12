/**
 * Upload Live report files that were already built (scripts/live-publish.ts without --upload) to R2, after saving a
 * copy of every file about to be replaced (CIV-1407). The cloud refresh builds with read-only keys in one job and
 * uploads here in another, so the write keys never run the analysis.
 *
 *   npx tsx scripts/live-publish-upload.ts ttc --from <dir of built files> --backup <dir>            save the current files only
 *   npx tsx scripts/live-publish-upload.ts ttc --from <dir of built files> --backup <dir> --upload   then upload
 *
 * --from holds <route>.json, agency.json and manifest.json, exactly as live-publish.ts wrote them. Only keys under
 * atlas/live/<agency>/ are read or written, and only the names in --from. Refuses files that are not the report set
 * (no manifest, no weeks, a listed route without a file) and refuses to replace newer data with older (the published
 * manifest's this-week end date is later than the new one) unless --allow-older.
 * Stops, before writing anything, when it could not save a single published file or the published manifest is missing:
 * that is either a first publish (pass --first-publish, by hand only) or a read that went wrong.
 * To undo an upload: run this again with --from <the backup dir> --allow-older --upload (the BACKUP.json note in a
 * backup folder is ignored).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ReportManifest { schema: number; agency: string; generatedAt?: string; thisWeek: { from: string; to: string } | null; lastWeek: { from: string; to: string } | null; routes: string[] }

/** The file names to upload, or the reason this folder is not a report set. `texts` is file name -> contents. */
export function checkReportSet(agency: string, texts: ReadonlyMap<string, string>): { files: string[] } | { problem: string } {
  const names = [...texts.keys()].sort();
  const bad = names.filter(n => !/^[A-Za-z0-9]+\.json$/.test(n));
  if (bad.length) return { problem: `unexpected file name(s): ${bad.join(', ')}` };
  for (const n of names) {
    try { JSON.parse(texts.get(n)!); } catch { return { problem: `${n} is not valid JSON` }; }
  }
  if (!texts.has('manifest.json') || !texts.has('agency.json')) return { problem: 'manifest.json and agency.json must both be there' };
  const manifest = JSON.parse(texts.get('manifest.json')!) as ReportManifest;
  if (manifest.agency !== agency) return { problem: `the manifest is for "${manifest.agency}", not "${agency}"` };
  if (!manifest.thisWeek?.to) return { problem: 'the manifest has no weeks: the analysis did not produce a weekly comparison' };
  if (!Array.isArray(manifest.routes) || manifest.routes.length === 0) return { problem: 'the manifest lists no routes' };
  const missing = manifest.routes.filter(r => !texts.has(`${r}.json`));
  if (missing.length) return { problem: `no file for listed route(s): ${missing.join(', ')}` };
  const extra = names.filter(n => n !== 'manifest.json' && n !== 'agency.json' && !manifest.routes.includes(n.slice(0, -5)));
  if (extra.length) return { problem: `file(s) the manifest does not list: ${extra.join(', ')}` };
  return { files: names };
}

/** The note this script leaves in a backup folder; never part of a report set. */
export const BACKUP_NOTE = 'BACKUP.json';

/** A folder's report files, name -> contents: files only (the separate yesterday/ set is a sub-folder), without the backup note. */
export function readReportFolder(dir: string): Map<string, string> {
  return new Map(readdirSync(dir).filter(n => n !== BACKUP_NOTE && statSync(join(dir, n)).isFile()).map(n => [n, readFileSync(join(dir, n), 'utf8')] as const));
}

/**
 * Why the save of the published files cannot be trusted as an undo copy, or null. Nothing saved, or no published
 * manifest, means a first publish or a failed read: both stop the upload unless --first-publish says it is the former.
 */
export function backupProblem(saved: readonly string[], firstPublish: boolean): string | null {
  if (firstPublish) return null;
  if (saved.length === 0) return 'none of the files is published yet, so there is nothing to save. If this really is the first publish, pass --first-publish.';
  if (!saved.includes('manifest.json')) return 'the published manifest.json could not be read, so the saved copy is not a complete report and the older-data check cannot run. If this really is the first publish, pass --first-publish.';
  return null;
}

/** True when the published data ends later than the new data (an upload would go backwards). */
export function wouldGoBackwards(publishedManifest: string | null, next: ReportManifest): boolean {
  if (!publishedManifest) return false;
  try {
    const cur = JSON.parse(publishedManifest) as ReportManifest;
    return !!cur.thisWeek?.to && !!next.thisWeek?.to && cur.thisWeek.to > next.thisWeek.to;
  } catch { return false; }
}

async function main() {
  await import('../pipeline/loadEnv.js');
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter(a => a === '--upload' || a === '--allow-older' || a === '--first-publish'));
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--') && !flags.has(argv[i])) args[argv[i].slice(2)] = argv[++i] ?? '';
  // The agency is the first argument when it is not an option.
  const agency = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'ttc';
  if (!/^[a-z0-9-]+$/.test(agency)) throw new Error(`live-publish-upload: bad agency "${agency}"`);
  if (!args.from || !args.backup) throw new Error('live-publish-upload: give --from <dir of built files> and --backup <dir>');
  const from = resolve(args.from), backup = resolve(args.backup);
  if (!existsSync(from)) throw new Error(`live-publish-upload: no folder at ${from}`);
  const PREFIX = `atlas/live/${agency}/`;

  const texts = readReportFolder(from);
  const set = checkReportSet(agency, texts);
  if ('problem' in set) throw new Error(`live-publish-upload: refusing ${from}: ${set.problem}`);
  const manifest = JSON.parse(texts.get('manifest.json')!) as ReportManifest;

  // Save what is published now, every file, before anything is written.
  const { r2Get, r2PutFile } = await import('../pipeline/r2.js');
  mkdirSync(backup, { recursive: true });
  const saved: string[] = [], fresh: string[] = [];
  let publishedManifest: string | null = null;
  for (const name of set.files) {
    const cur = await r2Get(`${PREFIX}${name}`);
    if (name === 'manifest.json') publishedManifest = cur;
    if (cur == null) { fresh.push(name); continue; }
    writeFileSync(join(backup, name), cur);
    saved.push(name);
  }
  writeFileSync(join(backup, BACKUP_NOTE), JSON.stringify({ prefix: PREFIX, savedAt: new Date().toISOString(), saved, notPublishedBefore: fresh }, null, 2));
  console.log(`live-publish-upload: saved ${saved.length} published file(s) to ${backup}${fresh.length ? `; not published before: ${fresh.join(', ')}` : ''}`);

  const noUndo = backupProblem(saved, flags.has('--first-publish'));
  if (noUndo) throw new Error(`live-publish-upload: refusing: ${noUndo}`);
  if (wouldGoBackwards(publishedManifest, manifest) && !flags.has('--allow-older')) {
    throw new Error(`live-publish-upload: refusing: the published data ends later than this (${manifest.thisWeek?.to}). Pass --allow-older to restore a backup.`);
  }
  if (!flags.has('--upload')) { console.log(`live-publish-upload: no --upload, nothing written. Would upload ${set.files.length} files to ${PREFIX}`); return; }
  for (const name of set.files) {
    const key = `${PREFIX}${name}`;
    if (!key.startsWith('atlas/live/')) throw new Error(`live-publish-upload: refusing key ${key}`);
    await r2PutFile(key, join(from, name), 'application/json', { cacheControl: 'public, max-age=300' });
    console.log(`  uploaded ${key}`);
  }
  console.log(`live-publish-upload: uploaded ${set.files.length} files (weeks ${manifest.lastWeek?.from ?? '?'} to ${manifest.thisWeek?.to})`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-publish-upload.ts')) {
  main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
