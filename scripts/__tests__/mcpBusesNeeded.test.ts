import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(mkdtempSync(join(tmpdir(), 'mcp-buses-')), 'Atlas');
mkdirSync(join(root, 'tmp', 'studio'), { recursive: true });
const before = process.env.ATLAS_ROOT;
process.env.ATLAS_ROOT = root;
const file = (feed: string) => JSON.stringify({ feed, referenceDate: '2026-11-17', periods: { pmPeak: [{ routes: ['01'], scheduled: 9 }] } });
afterAll(() => { if (before == null) delete process.env.ATLAS_ROOT; else process.env.ATLAS_ROOT = before; });

describe('buses_needed files (CIV-1910)', () => {
  it('says only that there are no figures, with no build command or path (#1613)', async () => {
    const { busesNeeded } = await import('../mcp/localData');
    expect(busesNeeded('nowhere', '1', 'pmPeak')).toEqual({ cached: false });
  });
  it("reads a file Studio built in the bundle worktree, as schedule_changes does (#1616)", async () => {
    const bundle = join(root, '..', 'Atlas-worktrees', 'bundle', 'tmp', 'studio');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, 'hamilton-vehicles.json'), file('bundle.zip'));
    writeFileSync(join(bundle, 'hamilton-before-after.json'), '{}');
    const { busesNeeded } = await import('../mcp/localData');
    const { studioFile } = await import('../mcp/diskStore');
    expect(busesNeeded('hamilton', '1', 'pmPeak')).toMatchObject({ cached: true, feed: 'bundle.zip', groups: [{ routes: ['01'] }] });
    // "1" finds the file's "01" (#1617); "10" stays its own route.
    expect(busesNeeded('hamilton', '01', 'pmPeak')).toMatchObject({ groups: [{ routes: ['01'] }] });
    expect(busesNeeded('hamilton', '10', 'pmPeak')).toMatchObject({ groups: [] });
    expect(studioFile('hamilton-before-after.json')).toBe(join(bundle, 'hamilton-before-after.json'));
    // This checkout's own file wins over the bundle's.
    writeFileSync(join(root, 'tmp', 'studio', 'hamilton-vehicles.json'), file('own.zip'));
    expect(busesNeeded('hamilton', '1', 'pmPeak')).toMatchObject({ cached: true, feed: 'own.zip' });
  });
});

describe('buses_needed answer fields (#1618)', () => {
  it('names the summed running and layover times for what they are, not a round trip', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(join(import.meta.dirname, '../mcp/localTools.ts'), 'utf8');
    expect(src).not.toMatch(/roundTrip(Running|Layover)Minutes/);
    expect(src).toMatch(/runningMinutesAllPatterns/);
  });
});
