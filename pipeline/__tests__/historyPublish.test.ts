import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runBackup } from '../history-config-backup.js';
import { diffConfigs, resolveBackupKey, runRestore } from '../history-config-restore.js';
import { runUpload, type Remote } from '../history-v2-upload.js';
import { HISTORY_CONFIG_KEY, byteLength, sha256, type BucketIO } from '../historyPublishLib.js';
import type { PutResult } from '../historyV2.js';

const NOW = new Date('2026-10-21T10:15:00Z');
const STAMP = '20261021-101500';
const BK = `atlas/history-config.backup-${STAMP}.json`;
const BM = `atlas/history-config.backup-${STAMP}.manifest.json`;
const PRE = `atlas/history-config.pre-restore-${STAMP}.json`;
const AGENCY_LIST = { sizeBytes: 10, sha256: 'abc', count: 2, slugs: ['a', 'b'] };
const ENV_ON = { ATLAS_HISTORY_V2: '1' };

class FakeBucket implements BucketIO {
  store = new Map<string, string>();
  puts: string[] = [];
  /** Corrupt what is read back for this key. */
  corruptReadBack: string | null = null;
  gets = 0;
  constructor(init: Record<string, string> = {}) { for (const [k, v] of Object.entries(init)) this.store.set(k, v); }
  async get(key: string) {
    this.gets++;
    const v = this.store.get(key);
    if (v == null) return null;
    return { body: key === this.corruptReadBack ? v + 'x' : v };
  }
  async put(key: string, body: string) { this.puts.push(key); this.store.set(key, body); }
}

const cfg = (...slugs: string[]) => JSON.stringify(slugs.map(slug => ({ slug, routes: [] })));
const lines: string[] = [];
const log = (l: string) => { lines.push(l); };
const base = { now: NOW, gitCommit: () => 'deadbeef', agencyList: AGENCY_LIST, log };

describe('history:backup', () => {
  it('dry run (default) reads but writes nothing, and prints the plan', async () => {
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: cfg('a', 'b') });
    lines.length = 0;
    const code = await runBackup({ ...base, argv: [], env: {}, makeIO: async () => io });
    expect(code).toBe(0);
    expect(io.puts).toEqual([]);
    expect(lines.join('\n')).toContain(BK);
    expect(lines.join('\n')).toContain(sha256(cfg('a', 'b')));
  });

  it('--write without ATLAS_HISTORY_V2=1 is refused before any I/O', async () => {
    const makeIO = vi.fn(async () => new FakeBucket());
    await expect(runBackup({ ...base, argv: ['--write'], env: {}, makeIO })).rejects.toThrow(/ATLAS_HISTORY_V2=1/);
    expect(makeIO).not.toHaveBeenCalled();
  });

  it('no credentials: dry run prints the plan and never builds an R2 client', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    lines.length = 0;
    const code = await runBackup({ ...base, argv: [], env: {} });
    spy.mockRestore();
    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/no credentials/);
  });

  it('--write puts the copy, verifies it, then writes the manifest', async () => {
    const body = cfg('a', 'b');
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: body });
    const code = await runBackup({ ...base, argv: ['--write'], env: ENV_ON, makeIO: async () => io });
    expect(code).toBe(0);
    expect(io.puts).toEqual([BK, BM]);
    expect(io.store.get(BK)).toBe(body);
    expect(JSON.parse(io.store.get(BM)!)).toEqual({
      sourceKey: HISTORY_CONFIG_KEY, backupKey: BK, sizeBytes: byteLength(body), sha256: sha256(body),
      createdAt: NOW.toISOString(), agencyCount: 2, gitCommit: 'deadbeef', agencyList: AGENCY_LIST,
    });
    expect(io.store.get(HISTORY_CONFIG_KEY)).toBe(body);
  });

  it('refuses to overwrite an existing backup key', async () => {
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: cfg('a'), [BK]: 'old backup' });
    lines.length = 0;
    const code = await runBackup({ ...base, argv: ['--write'], env: ENV_ON, makeIO: async () => io });
    expect(code).toBe(1);
    expect(io.puts).toEqual([]);
    expect(io.store.get(BK)).toBe('old backup');
    expect(lines.join('\n')).toMatch(/refusing to overwrite/);
  });

  it('a read-back mismatch fails and writes no manifest', async () => {
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: cfg('a') });
    io.corruptReadBack = BK;
    lines.length = 0;
    const code = await runBackup({ ...base, argv: ['--write'], env: ENV_ON, makeIO: async () => io });
    expect(code).toBe(1);
    expect(io.puts).toEqual([BK]);
    expect(io.store.has(BM)).toBe(false);
    expect(lines.join('\n')).toMatch(/read-back mismatch/);
  });

  it('missing source: nothing to back up', async () => {
    const io = new FakeBucket();
    expect(await runBackup({ ...base, argv: ['--write'], env: ENV_ON, makeIO: async () => io })).toBe(1);
    expect(io.puts).toEqual([]);
  });
});

async function makeBackup(io: FakeBucket, body: string, stamp = STAMP) {
  io.store.set(`atlas/history-config.backup-${stamp}.json`, body);
  io.store.set(`atlas/history-config.backup-${stamp}.manifest.json`, JSON.stringify({
    sourceKey: HISTORY_CONFIG_KEY, backupKey: `atlas/history-config.backup-${stamp}.json`, sizeBytes: byteLength(body),
    sha256: sha256(body), createdAt: 'x', agencyCount: 0, gitCommit: 'c', agencyList: null,
  }));
}

describe('history:restore', () => {
  const NOW2 = new Date('2026-10-22T09:00:00Z');
  const PRE2 = 'atlas/history-config.pre-restore-20261022-090000.json';
  const old = cfg('a', 'b', 'c');
  const live = JSON.stringify([{ slug: 'a', routes: [] }, { slug: 'b', routes: [1] }, { slug: 'd', routes: [] }]);

  it('resolves names and rejects unknown ones', () => {
    expect(resolveBackupKey(STAMP)).toBe(BK);
    expect(resolveBackupKey(`backup-${STAMP}`)).toBe(BK);
    expect(resolveBackupKey(`pre-restore-${STAMP}`)).toBe(PRE);
    expect(resolveBackupKey(BK)).toBe(BK);
    expect(() => resolveBackupKey('latest')).toThrow(/unknown backup name/);
    expect(() => resolveBackupKey('../x')).toThrow(/unknown backup name/);
  });

  it('diff summary lists agencies that differ', () => {
    expect(diffConfigs(live, old)).toEqual({ currentAgencies: 3, backupAgencies: 3, onlyInBackup: ['c'], onlyInCurrent: ['d'], changed: ['b'] });
  });

  it('dry run shows the diff and writes nothing', async () => {
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: live });
    await makeBackup(io, old);
    lines.length = 0;
    const code = await runRestore({ ...base, now: NOW2, argv: ['--from', STAMP], env: {}, makeIO: async () => io });
    expect(code).toBe(0);
    expect(io.puts).toEqual([]);
    const out = lines.join('\n');
    expect(out).toContain('only in backup (1): c');
    expect(out).toContain('only in current (1): d');
    expect(out).toContain('differ (1): b');
    expect(out).toContain(sha256(old));
    expect(out).toContain(PRE2);
  });

  it('--write makes the pre-restore backup first, then restores the exact bytes', async () => {
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: live });
    await makeBackup(io, old);
    const code = await runRestore({ ...base, now: NOW2, argv: ['--from', STAMP, '--write'], env: ENV_ON, makeIO: async () => io });
    expect(code).toBe(0);
    expect(io.puts).toEqual([PRE2, PRE2.replace(/\.json$/, '.manifest.json'), HISTORY_CONFIG_KEY]);
    expect(io.store.get(PRE2)).toBe(live);
    expect(io.store.get(HISTORY_CONFIG_KEY)).toBe(old);
  });

  it('--write without ATLAS_HISTORY_V2=1 is refused', async () => {
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: live });
    await expect(runRestore({ ...base, argv: ['--from', STAMP, '--write'], env: {}, makeIO: async () => io })).rejects.toThrow(/ATLAS_HISTORY_V2=1/);
    expect(io.puts).toEqual([]);
  });

  it('unknown backup name or missing backup fails with no writes', async () => {
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: live });
    await expect(runRestore({ ...base, argv: ['--from', 'nope', '--write'], env: ENV_ON, makeIO: async () => io })).rejects.toThrow(/unknown backup name/);
    expect(await runRestore({ ...base, argv: ['--from', '20250101-000000', '--write'], env: ENV_ON, makeIO: async () => io })).toBe(1);
    expect(io.puts).toEqual([]);
  });

  it('a backup that does not match its manifest is refused', async () => {
    const io = new FakeBucket({ [HISTORY_CONFIG_KEY]: live });
    await makeBackup(io, old);
    io.store.set(BK, old + ' ');
    expect(await runRestore({ ...base, argv: ['--from', STAMP, '--write'], env: ENV_ON, makeIO: async () => io })).toBe(1);
    expect(io.puts).toEqual([]);
  });
});

describe('history:upload', () => {
  const sidecar = (slug: string, periodKey: string, extra: Record<string, unknown> = {}) => JSON.stringify({
    version: 2, slug, periodKey, refDate: '20240612', routes: { A: { name: 'A', rep: { h: 10 } } }, ...extra,
  });
  const shapes = (slug: string, periodKey: string) => JSON.stringify({
    version: 1, slug, periodKey, refDate: '20240612', decimals: 5, toleranceM: 15, routes: { A: { c: [[-84, 33], [-84.1, 33.1]] } },
  });
  function mkDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'hist-up-'));
    for (const [rel, body] of Object.entries(files)) {
      const p = join(dir, rel);
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, body);
    }
    return dir;
  }
  class FakeRemote implements Remote {
    store = new Map<string, string>();
    puts: string[] = [];
    /** Keys whose put reports a race conflict. */
    raceConflict = new Set<string>();
    peek = async (key: string) => this.store.get(key) ?? null;
    sink = {
      put: async (key: string, body: string): Promise<PutResult> => {
        if (this.raceConflict.has(key)) return 'conflict';
        const ex = this.store.get(key);
        if (ex != null) return ex === body ? 'unchanged' : 'conflict';
        this.puts.push(key);
        this.store.set(key, body);
        return 'written';
      },
    };
  }
  const files = () => ({
    'history-v2/marta/20240101.json': sidecar('marta', '20240101'),
    'history-v2/marta/20250101.json': sidecar('marta', '20250101'),
    'history-v2-shapes/marta/20240101.json': shapes('marta', '20240101'),
    'marta-report.json': '{}',
  });

  it('new keys are put (sidecars and shapes), report file ignored', async () => {
    const dir = mkDir(files());
    const r = new FakeRemote();
    lines.length = 0;
    const code = await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--write'], env: ENV_ON, makeRemote: async () => r });
    expect(code).toBe(0);
    expect(r.puts).toEqual(['history-v2-shapes/marta/20240101.json', 'history-v2/marta/20240101.json', 'history-v2/marta/20250101.json']);
    expect(lines.join('\n')).toMatch(/Totals: 3 objects/);
  });

  it('identical existing content is a no-op', async () => {
    const dir = mkDir(files());
    const r = new FakeRemote();
    r.store.set('history-v2/marta/20240101.json', sidecar('marta', '20240101'));
    const code = await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--write'], env: ENV_ON, makeRemote: async () => r });
    expect(code).toBe(0);
    expect(r.puts).not.toContain('history-v2/marta/20240101.json');
    expect(r.puts).toHaveLength(2);
  });

  it('a conflict stops the run with non-zero exit and no writes at all', async () => {
    const dir = mkDir(files());
    const r = new FakeRemote();
    r.store.set('history-v2/marta/20240101.json', 'different');
    lines.length = 0;
    const code = await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--write'], env: ENV_ON, makeRemote: async () => r });
    expect(code).toBe(1);
    expect(r.puts).toEqual([]);
    expect(r.store.get('history-v2/marta/20240101.json')).toBe('different');
    expect(lines.join('\n')).toContain('history-v2/marta/20240101.json');
  });

  it('a race conflict mid-run stops immediately: later keys are not written', async () => {
    const dir = mkDir(files());
    const r = new FakeRemote();
    r.raceConflict.add('history-v2/marta/20240101.json'); // second in sorted order
    const code = await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--write'], env: ENV_ON, makeRemote: async () => r });
    expect(code).toBe(1);
    expect(r.puts).toEqual(['history-v2-shapes/marta/20240101.json']);
  });

  it('exactly one agency per run', async () => {
    const dir = mkDir(files());
    const makeRemote = vi.fn(async () => new FakeRemote());
    await expect(runUpload({ log, argv: ['--slug', 'marta', '--slug', 'stm', '--dir', dir], env: {}, makeRemote })).rejects.toThrow(/more than once/);
    await expect(runUpload({ log, argv: ['--slug', 'marta,stm', '--dir', dir], env: {}, makeRemote })).rejects.toThrow(/exactly one agency/);
    expect(makeRemote).not.toHaveBeenCalled();
  });

  it('an invalid or unknown-version file refuses the whole run before any R2 access', async () => {
    const dir = mkDir({
      'history-v2/marta/20240101.json': sidecar('marta', '20240101'),
      'history-v2/marta/20250101.json': JSON.stringify({ version: 3, slug: 'marta', periodKey: '20250101', refDate: '20250101', routes: {} }),
    });
    const makeRemote = vi.fn(async () => new FakeRemote());
    lines.length = 0;
    expect(await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--write'], env: ENV_ON, makeRemote })).toBe(1);
    expect(makeRemote).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/unsupported-version/);
  });

  it('path/slug mismatch is refused', async () => {
    const wrongSlug = mkDir({ 'history-v2/marta/20240101.json': sidecar('stm', '20240101') });
    const wrongPeriod = mkDir({ 'history-v2/marta/20240101.json': sidecar('marta', '20240202') });
    const wrongShapes = mkDir({ 'history-v2/marta/20240101.json': sidecar('marta', '20240101'), 'history-v2-shapes/marta/20240101.json': shapes('stm', '20240101') });
    const makeRemote = vi.fn(async () => new FakeRemote());
    for (const dir of [wrongSlug, wrongPeriod, wrongShapes]) {
      expect(await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--write'], env: ENV_ON, makeRemote })).toBe(1);
    }
    expect(makeRemote).not.toHaveBeenCalled();
  });

  it('holiday period without repick is skipped (with its shapes) and listed; a repicked one is kept', async () => {
    const holiday = { refDateQuality: { holiday: true, reason: 'Christmas week', tripsOnRef: 1, medianTrips: 5 } };
    const repicked = { refDateQuality: { holiday: true, reason: 'x', tripsOnRef: 1, medianTrips: 5, repicked: { from: '20250105', to: '20250115' } } };
    const dir = mkDir({
      'history-v2/marta/20240101.json': sidecar('marta', '20240101', holiday),
      'history-v2-shapes/marta/20240101.json': shapes('marta', '20240101'),
      'history-v2/marta/20250101.json': sidecar('marta', '20250101', repicked),
    });
    const r = new FakeRemote();
    lines.length = 0;
    const code = await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--write'], env: ENV_ON, makeRemote: async () => r });
    expect(code).toBe(0);
    expect(r.puts).toEqual(['history-v2/marta/20250101.json']);
    expect(lines.join('\n')).toMatch(/SKIPPED period 20240101/);
  });

  it('--period filters', async () => {
    const dir = mkDir(files());
    const r = new FakeRemote();
    await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--period', '20250101', '--write'], env: ENV_ON, makeRemote: async () => r });
    expect(r.puts).toEqual(['history-v2/marta/20250101.json']);
  });

  it('dry run with a remote writes nothing and classifies keys', async () => {
    const dir = mkDir(files());
    const r = new FakeRemote();
    r.store.set('history-v2/marta/20240101.json', sidecar('marta', '20240101'));
    lines.length = 0;
    const code = await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir], env: {}, makeRemote: async () => r });
    expect(code).toBe(0);
    expect(r.puts).toEqual([]);
    expect(lines.join('\n')).toMatch(/identical 1 .*conflict 0/);
  });

  it('--write without ATLAS_HISTORY_V2=1 is refused', async () => {
    const dir = mkDir(files());
    const makeRemote = vi.fn(async () => new FakeRemote());
    await expect(runUpload({ log, argv: ['--slug', 'marta', '--dir', dir, '--write'], env: {}, makeRemote })).rejects.toThrow(/ATLAS_HISTORY_V2=1/);
    expect(makeRemote).not.toHaveBeenCalled();
  });

  it('dry run without credentials builds no R2 client and prints the local plan', async () => {
    const dir = mkDir(files());
    lines.length = 0;
    // no makeRemote injected: the real factory would be called if credentials were present
    const code = await runUpload({ log, argv: ['--slug', 'marta', '--dir', dir], env: {} });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('remote state unknown (no credentials; dry-run listing skipped)');
    expect(lines.join('\n')).toMatch(/Totals: 3 objects/);
  });
});
