import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareCrons, expectedPrefixes, formatAge, parseWranglerToml } from './audit-live-state';

describe('parseWranglerToml', () => {
  it('reads name, bucket and crons, ignoring comments', () => {
    const cfg = parseWranglerToml([
      '# name = "commented-out"',
      'name = "atlas-gtfs-rt-archiver-x"',
      '[vars]',
      'name = "not-top-level"',
      '[[r2_buckets]]',
      'binding = "BUCKET"',
      'bucket_name = "atlas-live"',
      '[triggers]',
      'crons = ["* * * * *", "*/5 * * * *"] # every minute',
    ].join('\n'), 'wrangler.x.toml');
    expect(cfg).toEqual({ file: 'wrangler.x.toml', name: 'atlas-gtfs-rt-archiver-x', bucket: 'atlas-live', crons: ['* * * * *', '*/5 * * * *'] });
  });

  it('reads a multi-line crons array, and none when there is no [triggers]', () => {
    expect(parseWranglerToml('name = "a"\n[triggers]\ncrons = [\n  "0 * * * *",\n]\n').crons).toEqual(['0 * * * *']);
    expect(parseWranglerToml('name = "a"\n[vars]\nX = "1"\n').crons).toEqual([]);
  });

  // CIV-1689: the repo config must match the live schedule (TTC, Hamilton and Kingston positions every minute).
  it('matches the archiver configs in the repo', () => {
    const read = (f: string) => parseWranglerToml(readFileSync(new URL(`../workers/gtfs-rt-archiver/${f}`, import.meta.url), 'utf8'), f);
    expect(read('wrangler.toml')).toMatchObject({ name: 'atlas-gtfs-rt-archiver-ttc-positions', crons: ['* * * * *'] });
    expect(read('wrangler.kingston.toml')).toMatchObject({ bucket: 'atlas-live-kingston', crons: ['* * * * *'] });
    expect(read('wrangler.hamilton.toml')).toMatchObject({ crons: ['* * * * *'] });
    for (const f of ['wrangler.ttc-trips.toml', 'wrangler.stm.toml', 'wrangler.burlington-halifax.toml']) {
      expect(read(f).crons, f).toEqual([]);
    }
  });
});

describe('compareCrons', () => {
  const cfg = (name: string, crons: string[]) => ({ file: `${name}.toml`, name, bucket: 'atlas-live', crons });

  it('flags a live cron the toml lacks, and passes matching ones regardless of order or spacing', () => {
    const rows = compareCrons(
      { a: ['* * * * *'], b: [], c: ['*/5 * * * *', '*  * * * *'] },
      [cfg('a', []), cfg('b', []), cfg('c', ['* * * * *', '*/5 * * * *'])],
    );
    expect(rows.map(r => [r.worker, r.status])).toEqual([['a', 'mismatch'], ['b', 'ok'], ['c', 'ok']]);
  });

  it('flags a live Worker with no toml and a toml with no live Worker', () => {
    const rows = compareCrons({ orphan: [] }, [cfg('undeployed', ['* * * * *'])]);
    expect(rows.map(r => [r.worker, r.status])).toEqual([['orphan', 'no toml'], ['undeployed', 'not deployed']]);
  });
});

describe('expectedPrefixes and formatAge', () => {
  it('puts Kingston in its own bucket and the rest in atlas-live', () => {
    const p = expectedPrefixes();
    expect(p['atlas-live-kingston']).toEqual(['kingston/', 'positions/kingston/']);
    expect(p['atlas-live']).toContain('positions/ttc/');
    expect(p['atlas-live']).not.toContain('kingston/');
  });

  it('formats ages', () => {
    expect(formatAge(90_000)).toBe('2 min');
    expect(formatAge(5 * 3600_000)).toBe('5 h');
    expect(formatAge(10 * 86400_000)).toBe('10 days');
  });
});
