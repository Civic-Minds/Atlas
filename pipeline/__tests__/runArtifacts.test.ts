import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENCY_ARTIFACT_SUFFIXES, parseRunPrefixArg, promoteRunArtifacts, promotedKey, runArtifactPrefix, stagedAgencySlugs } from '../runArtifacts';

// CIV-522: a rebuild stages its agency files under atlas/runs/<run id>/ and copies them to top-level
// only after the release is public.
describe('run prefix', () => {
  it('is atlas/runs/<run id>, and refuses anything that could reach top-level', () => {
    expect(runArtifactPrefix('40997616432')).toBe('atlas/runs/40997616432');
    expect(() => runArtifactPrefix('../x')).toThrow();
    expect(() => runArtifactPrefix('')).toThrow();
  });

  it('reads --run-prefix only under atlas/runs/', () => {
    expect(parseRunPrefixArg(['--write', '--run-prefix', 'atlas/runs/123'], '--run-prefix')).toBe('atlas/runs/123');
    expect(parseRunPrefixArg(['--source-prefix', 'atlas/runs/123/'], '--source-prefix')).toBe('atlas/runs/123');
    expect(parseRunPrefixArg(['--write'], '--run-prefix')).toBeNull();
    expect(() => parseRunPrefixArg(['--run-prefix', 'atlas'], '--run-prefix')).toThrow();
    expect(() => parseRunPrefixArg(['--run-prefix', 'atlas/runs'], '--run-prefix')).toThrow();
    expect(() => parseRunPrefixArg(['--run-prefix', 'atlas/runs/1/2'], '--run-prefix')).toThrow();
    expect(() => parseRunPrefixArg(['--run-prefix', '--write'], '--run-prefix')).toThrow();
  });
});

describe('staged agencies', () => {
  it('are the agencies whose route file is under the prefix', () => {
    const keys = [
      'atlas/runs/9/ttc.json', 'atlas/runs/9/ttc-stops.json',
      'atlas/runs/9/go-stops.json',
    ];
    expect([...stagedAgencySlugs(keys, 'atlas/runs/9', ['ttc', 'go', 'yrt'])]).toEqual(['ttc']);
  });

  it('no slug is another slug plus an artifact suffix, so a file name names one agency', () => {
    const slugs: string[] = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/index.json'), 'utf8')).agencies.map((a: { slug: string }) => a.slug);
    const all = new Set(slugs);
    const clashes = slugs.flatMap(slug => AGENCY_ARTIFACT_SUFFIXES.filter(suffix => suffix && all.has(`${slug}${suffix}`)).map(suffix => `${slug}${suffix}`));
    expect(clashes).toEqual([]);
  });
});

describe('promote', () => {
  const store = (files: Record<string, string>) => {
    const puts: Record<string, string> = {};
    return {
      puts,
      list: async (prefix: string) => Object.keys(files).filter(key => key.startsWith(prefix)),
      get: async (key: string) => files[key] ?? null,
      put: async (key: string, body: string) => { puts[key] = body; },
    };
  };
  const runAll = async (tasks: Array<() => Promise<void>>) => { for (const task of tasks) await task(); };

  it('copies exactly the staged files to their top-level keys and nothing else', async () => {
    const s = store({
      'atlas/runs/9/ttc.json': 'T', 'atlas/runs/9/ttc-stops.json': 'S',
      'atlas/runs/9/nested/x.json': 'N',
      'atlas/runs/8/ttc.json': 'old run',
      'atlas/ttc.json': 'published',
    });
    const result = await promoteRunArtifacts('atlas/runs/9', s, runAll);
    expect(s.puts).toEqual({ 'atlas/ttc.json': 'T', 'atlas/ttc-stops.json': 'S' });
    expect(result).toEqual({ promoted: 2, skipped: ['atlas/runs/9/nested/x.json'] });
  });

  it('maps a staged key to top-level only from inside its own prefix', () => {
    expect(promotedKey('atlas/runs/9/ttc-sections.json', 'atlas/runs/9')).toBe('atlas/ttc-sections.json');
    expect(promotedKey('atlas/runs/90/ttc.json', 'atlas/runs/9')).toBeNull();
    expect(promotedKey('atlas/runs/9/readme.txt', 'atlas/runs/9')).toBeNull();
  });

  it('fails when a staged file disappears, rather than skipping it', async () => {
    const s = store({ 'atlas/runs/9/ttc.json': 'T' });
    s.get = async () => null;
    await expect(promoteRunArtifacts('atlas/runs/9', s, runAll)).rejects.toThrow(/vanished/);
  });
});

describe('the rebuild writes stay off top-level until the release is public', () => {
  const read = (file: string) => readFileSync(resolve(__dirname, '..', '..', file), 'utf8');

  it('reprocess stages every agency file under the run prefix when one is given', () => {
    const src = read('pipeline/reprocess-derived-artifacts.ts');
    expect(src).toContain("r2Put(`${runPrefix ?? 'atlas'}/${name}`");
    expect(AGENCY_ARTIFACT_SUFFIXES).toEqual(['', '-stops', '-corridors', '-trips', '-stops-meta', '-sections']);
  });

  it('the publish job stages, builds from the stage, and promotes only after publishing', () => {
    const yml = read('.github/workflows/rebuild-release.yml');
    const stage = yml.indexOf('--write --run-prefix "$RUN_PREFIX"');
    const build = yml.indexOf('--allow-stale-data --source-prefix "$RUN_PREFIX"');
    const publish = yml.indexOf('npm run publish-data-release');
    const promote = yml.indexOf('promote-run-artifacts.ts --run-prefix "$RUN_PREFIX"');
    expect(stage).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(stage);
    expect(publish).toBeGreaterThan(build);
    expect(promote).toBeGreaterThan(publish);
    // No other top-level agency write in the publish job.
    expect(yml).not.toMatch(/reprocess-sharded\.sh --write (?!--run-prefix)/);
  });
});
