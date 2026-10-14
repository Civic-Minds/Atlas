import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_ARTIFACT_SCHEMA_VERSION, TILE_RULES_VERSION } from '../../shared/artifactSchema';
import { R2_PUBLIC_URL } from '../../shared/config';

// CIV-43: publish-data-release.ts is a top-level script, so these tests run it for real
// (dynamic import) against an in-memory bucket behind a fake fetch. Nothing touches R2:
// r2Put is a spy, and every refusal must leave it uncalled.

const r2Put = vi.hoisted(() => vi.fn(async () => undefined));
const spawnSync = vi.hoisted(() => vi.fn(() => ({ status: 0 })));
const pmtilesNames = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../loadEnv.js', () => ({}));
vi.mock('../r2.js', () => ({ r2Put }));
vi.mock('pmtiles', () => ({
  PMTiles: class {
    constructor(private url: string) {}
    async getMetadata() { return { name: pmtilesNames.get(this.url.split('?')[0].replace(/^.*\/(atlas\/)/, '$1')) }; }
  },
}));
vi.mock('child_process', async importOriginal => ({ ...(await importOriginal<typeof import('child_process')>()), spawnSync }));

const base = R2_PUBLIC_URL.replace(/\/$/, '');
const RELEASE = 'release-new1';
const prefix = `atlas/releases/${RELEASE}`;
const manifest = {
  releaseId: RELEASE,
  generatedAt: '2026-10-14T12:00:00.000Z',
  routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
  tileRulesVersion: TILE_RULES_VERSION,
  pmtilesKey: `${prefix}/atlas.pmtiles`,
  overviewPmtilesKey: `${prefix}/atlas-overview.pmtiles`,
  agencyPrefix: `${prefix}/agencies`,
};
const agency = (slug: string) => ({ slug, lastFeedExpiry: '20991231', lastRefreshedAt: '2026-10-13' });
const routeFile = (stamp: string, routeId = 'r1') => JSON.stringify({
  atlasReleaseId: stamp,
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[-79.4, 43.6], [-79.3, 43.7]] },
    properties: { routeId, routeShortName: routeId, routeType: 3, day: 'Weekday', directionId: 0, headway: 15, tier: '15' },
  }],
});

let dir: string;
let cwd: string;
let bucket: Map<string, string>;
let writtenManifest: string;

function stockBucket(overrides: { stamp?: string; skip?: string[]; agencySnapshot?: (slug: string) => string } = {}) {
  bucket = new Map();
  bucket.set(`${prefix}/manifest.json`, JSON.stringify(manifest));
  for (const slug of ['alpha', 'beta']) {
    if (overrides.skip?.includes(slug)) continue;
    bucket.set(`${manifest.agencyPrefix}/${slug}.json`, overrides.agencySnapshot?.(slug) ?? routeFile(overrides.stamp ?? RELEASE, `${slug}-1`));
  }
  pmtilesNames.set(manifest.pmtilesKey, RELEASE);
  pmtilesNames.set(manifest.overviewPmtilesKey, RELEASE);
}

async function runScript(argv: string[] = []): Promise<void> {
  process.argv = ['node', 'publish-data-release.ts', ...argv];
  vi.resetModules();
  await import('../publish-data-release');
}

beforeEach(() => {
  cwd = process.cwd();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-release-'));
  fs.mkdirSync(path.join(dir, 'public/data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'public/data/index.json'), JSON.stringify({ agencies: [agency('alpha'), agency('beta')] }));
  writtenManifest = path.join(dir, 'tmp/atlas-release-manifest.json');
  fs.writeFileSync(writtenManifest, JSON.stringify(manifest));
  process.chdir(dir);
  r2Put.mockClear();
  spawnSync.mockClear();
  pmtilesNames.clear();
  stockBucket();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: { method?: string }) => {
    const key = String(input).replace(`${base}/`, '').split('?')[0];
    const body = bucket.get(key);
    if (body === undefined) return new Response(null, { status: 404 });
    return new Response(init?.method === 'HEAD' ? null : body, { status: 200 });
  }));
});

afterEach(() => {
  process.chdir(cwd);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const putKeys = () => r2Put.mock.calls.map(call => (call as unknown as [string])[0]);

describe('publish-data-release', () => {
  it('publishes a consistent release: pointer, data version, history, then removes the manifest', async () => {
    await runScript();

    expect(putKeys()).toEqual(['atlas/release.json', 'atlas/data-version.json', 'atlas/release-history.json']);
    const pointer = JSON.parse((r2Put.mock.calls[0] as unknown as [string, string])[1]);
    expect(pointer.releaseId).toBe(RELEASE);
    const history = JSON.parse((r2Put.mock.calls[2] as unknown as [string, string])[1]);
    expect(history).toEqual([{ releaseId: RELEASE, generatedAt: manifest.generatedAt }]);
    expect(fs.existsSync(writtenManifest)).toBe(false);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('refuses without a local manifest', async () => {
    fs.rmSync(writtenManifest);
    await expect(runScript()).rejects.toThrow(/Missing .*atlas-release-manifest\.json/);
    expect(r2Put).not.toHaveBeenCalled();
  });

  it('refuses a manifest built under other tile rules', async () => {
    fs.writeFileSync(writtenManifest, JSON.stringify({ ...manifest, tileRulesVersion: TILE_RULES_VERSION + 1 }));
    await expect(runScript()).rejects.toThrow(/Refusing to publish: .*tile rules/);
    expect(r2Put).not.toHaveBeenCalled();
    expect(fs.existsSync(writtenManifest)).toBe(true);
  });

  it('refuses when the uploaded manifest is missing (upload unfinished)', async () => {
    bucket.delete(`${prefix}/manifest.json`);
    await expect(runScript()).rejects.toThrow(/Uploaded manifest .* missing or differs/);
    expect(r2Put).not.toHaveBeenCalled();
    expect(fs.existsSync(writtenManifest)).toBe(true);
  });

  it('refuses when the map tiles carry another release stamp', async () => {
    pmtilesNames.set(manifest.pmtilesKey, 'release-old0');
    await expect(runScript()).rejects.toThrow(/Map tiles are not stamped with release-new1/);
    expect(r2Put).not.toHaveBeenCalled();
  });

  it('refuses when an agency snapshot carries another release stamp', async () => {
    stockBucket({ stamp: 'release-old0' });
    await expect(runScript()).rejects.toThrow(/Agency snapshots not stamped with release-new1/);
    expect(r2Put).not.toHaveBeenCalled();
  });

  it('refuses to roll back to a release as old as the public one', async () => {
    bucket.set('atlas/release.json', JSON.stringify({ ...manifest, releaseId: 'release-live1', generatedAt: '2026-10-14T12:00:00.000Z' }));
    await expect(runScript()).rejects.toThrow(/same age or newer/);
    expect(r2Put).not.toHaveBeenCalled();
  });

  it('refuses when a public agency has no route file in the release', async () => {
    // The sampled stamp check reads alpha and beta, so remove one only after sampling:
    // answer HEAD (existence) with 404 for beta while GET still serves it.
    const real = globalThis.fetch as unknown as (input: string, init?: { method?: string }) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: { method?: string }) => (
      init?.method === 'HEAD' && String(input).includes('/beta.json') ? new Response(null, { status: 404 }) : real(input, init)
    )));
    await expect(runScript()).rejects.toThrow(/1 public agencies have no route file .*: beta/);
    expect(r2Put).not.toHaveBeenCalled();
  });

  it('blocks on a release diff red flag, and publishes once the flag is allowed after review', async () => {
    // beta ships with no routes while the public release still has some.
    stockBucket();
    bucket.set(`${manifest.agencyPrefix}/beta.json`, JSON.stringify({ atlasReleaseId: RELEASE, type: 'FeatureCollection', features: [] }));
    bucket.set('atlas/beta.json', routeFile('release-old0', 'beta-1'));

    await expect(runScript()).rejects.toThrow(/release diff gate blocked beta/);
    expect(r2Put).not.toHaveBeenCalled();
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'tmp/release-diff', `${RELEASE}.json`), 'utf8'));
    expect(report.blocked).toEqual(['beta']);
    expect(fs.existsSync(writtenManifest)).toBe(true);

    const flags = report.flags.filter((f: any) => f.slug === 'beta' && f.level === 'red').map((f: any) => f.flag);
    expect(flags.length).toBeGreaterThan(0);
    await runScript(flags.flatMap((flag: string) => ['--allow', `beta:${flag}`]));
    expect(putKeys()[0]).toBe('atlas/release.json');
  });

  it('rejects an --allow for an agency the registry does not know before reading R2', async () => {
    await expect(runScript(['--allow', 'nowhere:drop'])).rejects.toThrow(/nowhere:drop: unknown agency/);
    expect(fetch).not.toHaveBeenCalled();
    expect(r2Put).not.toHaveBeenCalled();
  });

  it('still counts the release as published when the history file cannot be written', async () => {
    r2Put.mockImplementation(async (...args: unknown[]) => {
      if (args[0] === 'atlas/release-history.json') throw new Error('R2 down');
    });
    await runScript();
    expect(putKeys()[0]).toBe('atlas/release.json');
    expect(fs.existsSync(writtenManifest)).toBe(false);
    r2Put.mockImplementation(async () => undefined);
  });

  it('does not touch an unreadable history file', async () => {
    bucket.set('atlas/release-history.json', 'not json');
    await runScript();
    expect(putKeys()).not.toContain('atlas/release-history.json');
    expect(fs.existsSync(writtenManifest)).toBe(false);
  });

  it('does not fail the publish when the agency summaries refresh fails', async () => {
    spawnSync.mockReturnValueOnce({ status: 1 });
    await runScript();
    expect(putKeys()[0]).toBe('atlas/release.json');
    expect(fs.existsSync(writtenManifest)).toBe(false);
  });
});
