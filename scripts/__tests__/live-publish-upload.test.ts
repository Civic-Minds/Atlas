import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKUP_NOTE, backupProblem, checkReportSet, readReportFolder, wouldGoBackwards, type ReportManifest } from '../live-publish-upload';

const manifest = (over: Partial<ReportManifest> = {}): ReportManifest => ({
  schema: 1, agency: 'ttc', thisWeek: { from: '2026-11-05', to: '2026-11-11' }, lastWeek: { from: '2026-10-29', to: '2026-11-04' }, routes: ['504', '512'], ...over,
});
const set = (m: ReportManifest, extra: Record<string, string> = {}) => new Map(Object.entries({
  'manifest.json': JSON.stringify(m), 'agency.json': '{"status":"ready"}', '504.json': '{"status":"ready"}', '512.json': '{"status":"held"}', ...extra,
}));

describe('live-publish-upload', () => {
  it('accepts a complete report set and lists exactly its files', () => {
    expect(checkReportSet('ttc', set(manifest()))).toEqual({ files: ['504.json', '512.json', 'agency.json', 'manifest.json'] });
  });

  it('refuses anything that is not a complete report set', () => {
    const problem = (texts: Map<string, string>) => (checkReportSet('ttc', texts) as { problem: string }).problem;
    expect(problem(set(manifest(), { '../x.json': '{}' }))).toMatch(/unexpected file name/);
    expect(problem(set(manifest(), { 'notes.txt': 'x' }))).toMatch(/unexpected file name/);
    expect(problem(set(manifest(), { '504.json': '{broken' }))).toMatch(/not valid JSON/);
    expect(problem(set(manifest({ agency: 'stm' })))).toMatch(/is for "stm"/);
    expect(problem(set(manifest({ thisWeek: null })))).toMatch(/no weeks/);
    expect(problem(set(manifest({ routes: [] })))).toMatch(/lists no routes/);
    expect(problem(set(manifest({ routes: ['504', '512', '505'] })))).toMatch(/no file for listed route\(s\): 505/);
    expect(problem(set(manifest(), { '999.json': '{}' }))).toMatch(/does not list: 999.json/);
    const noAgency = set(manifest()); noAgency.delete('agency.json');
    expect(problem(noAgency)).toMatch(/must both be there/);
  });

  it('refuses to replace newer published data with older, and allows the same or newer', () => {
    const published = JSON.stringify(manifest());
    expect(wouldGoBackwards(published, manifest({ thisWeek: { from: '2026-10-08', to: '2026-10-14' } }))).toBe(true);
    expect(wouldGoBackwards(published, manifest())).toBe(false);
    expect(wouldGoBackwards(published, manifest({ thisWeek: { from: '2026-11-12', to: '2026-11-18' } }))).toBe(false);
    expect(wouldGoBackwards(null, manifest())).toBe(false);
  });

  it('restores a backup folder the script made: its note and sub-folders are not part of the set', () => {
    // What a backup looks like on disk: the saved files, plus the BACKUP.json note the script writes beside them.
    const dir = mkdtempSync(join(tmpdir(), 'live-backup-'));
    for (const [name, text] of set(manifest())) writeFileSync(join(dir, name), text);
    writeFileSync(join(dir, BACKUP_NOTE), JSON.stringify({ prefix: 'atlas/live/ttc/', saved: ['504.json'], notPublishedBefore: [] }));
    mkdirSync(join(dir, 'yesterday'));
    writeFileSync(join(dir, 'yesterday', 'agency.json'), '{}');
    const texts = readReportFolder(dir);
    expect([...texts.keys()].sort()).toEqual(['504.json', '512.json', 'agency.json', 'manifest.json']);
    expect(checkReportSet('ttc', texts)).toEqual({ files: ['504.json', '512.json', 'agency.json', 'manifest.json'] });
    // Restoring is older data by definition: the older-data check is what --allow-older is for.
    expect(wouldGoBackwards(JSON.stringify(manifest({ thisWeek: { from: '2026-11-12', to: '2026-11-18' } })), JSON.parse(texts.get('manifest.json')!))).toBe(true);
  });

  it('stops when the published files could not be saved, unless it is said to be the first publish', () => {
    expect(backupProblem([], false)).toMatch(/nothing to save.*--first-publish/);
    expect(backupProblem(['504.json', 'agency.json'], false)).toMatch(/manifest\.json could not be read/);
    expect(backupProblem(['504.json', 'agency.json', 'manifest.json'], false)).toBeNull();
    expect(backupProblem([], true)).toBeNull();
  });
});
