import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agency } from '../../App';
import { ON_DEMAND_PUBLIC } from '../../../shared/config';
import { isAgencyVisibleInBrowser } from '../../../shared/agencyVisibility';
import { buildOnDemandRelease, releaseFiles, releaseWithHeldServices } from '../../data/onDemandExport';
import { ATTACHED_ON_DEMAND_SERVICES, STANDALONE_ON_DEMAND_AGENCIES } from '../../data/onDemandRegistry';
import { loadOnDemandSources } from '../../data/onDemandSources';
import { applyOnDemand, loadOnDemandGeometry, loadOnDemandIndex } from '../onDemandLoader';
import type { OnDemandGeometry } from '../../../shared/onDemandData';

const catalog = Object.keys(ATTACHED_ON_DEMAND_SERVICES).map(slug => ({ slug, name: slug, region: 'Test', center: [0, 0], url: `https://x/${slug}.json` }) as unknown as Agency);

function roundTrip(audience: 'beta' | 'public') {
  const release = buildOnDemandRelease(audience, '2026-10-11T00:00:00.000Z');
  // What the browser sees: every file through JSON, as served from R2.
  const files = releaseFiles(release);
  const index = JSON.parse(files.get(`v/${release.manifest.version}/index.json`)!);
  const geometries = new Map<string, OnDemandGeometry>(index.services.map((s: { slug: string; geometryKey: string }) =>
    [s.slug, JSON.parse(files.get(`v/${release.manifest.version}/${s.geometryKey}`)!)]));
  return { release, index, geometries };
}

describe('on-demand R2 round trip (CIV-50)', () => {
  it('rebuilds every attached service exactly as the bundled data had it', () => {
    const { index, geometries } = roundTrip('beta');
    const agencies = applyOnDemand(catalog, index, geometries);
    for (const [slug, area] of Object.entries(ATTACHED_ON_DEMAND_SERVICES)) {
      expect(agencies.find(a => a.slug === slug)?.onDemandServiceArea, slug).toEqual(JSON.parse(JSON.stringify(area)));
    }
  });

  it('rebuilds every on-demand-only agency, with its rollout fields from the public flag', () => {
    const { index, geometries } = roundTrip('beta');
    const agencies = applyOnDemand([], index, geometries);
    for (const original of STANDALONE_ON_DEMAND_AGENCIES) {
      expect(agencies.find(a => a.slug === original.slug), original.slug).toEqual(JSON.parse(JSON.stringify(original)));
    }
  });

  it('keeps beta-only services out of the public release', () => {
    const { release } = roundTrip('public');
    expect(release.index.services.every(s => s.public)).toBe(true);
    if (!ON_DEMAND_PUBLIC) expect(release.index.services).toHaveLength(0);
  });

  it('versions the release by content', () => {
    expect(buildOnDemandRelease('beta', 'a').manifest.version).toBe(buildOnDemandRelease('beta', 'b').manifest.version);
  });

  it('draws no zone until its geometry has loaded, and never invents one', () => {
    const { index } = roundTrip('beta');
    const agencies = applyOnDemand(catalog, index, new Map());
    expect(agencies.every(a => !a.onDemandServiceArea)).toBe(true);
    const standalone = agencies.filter(a => a.onDemandOnly);
    expect(standalone).toHaveLength(STANDALONE_ON_DEMAND_AGENCIES.length + loadOnDemandSources().filter(source => source.agency).length);
    for (const agency of standalone) expect(isAgencyVisibleInBrowser(agency, { mode: 'public' })).toBe(ON_DEMAND_PUBLIC);
  });

  it('leaves the catalog alone when the index is unavailable', () => {
    expect(applyOnDemand(catalog, null, new Map())).toEqual(catalog);
  });
});

describe('publishing around a held service', () => {
  const live = buildOnDemandRelease('beta', 't0');
  const liveSnapshot = { index: live.index, geometries: new Map(live.geometries.map(g => [g.slug, g])) };

  it('keeps the live version of a held service and takes the new version of the rest', () => {
    const candidate = buildOnDemandRelease('beta', 't1');
    const changed = { ...candidate, geometries: candidate.geometries.map(g => g.slug === 'uta' ? { ...g, features: g.features.slice(0, 1) } : g) };
    const release = releaseWithHeldServices(changed, liveSnapshot, new Set(['uta']));
    expect(release.geometries.find(g => g.slug === 'uta')).toEqual(liveSnapshot.geometries.get('uta'));
    expect(release.index.services).toHaveLength(live.index.services.length);
  });

  it('leaves a held service out when it was never live', () => {
    const release = releaseWithHeldServices(buildOnDemandRelease('beta', 't1'), null, new Set(['uta']));
    expect(release.index.services.some(s => s.slug === 'uta')).toBe(false);
  });
});

describe('loading from R2', () => {
  afterEach(() => vi.unstubAllGlobals());

  function serve(files: Map<string, string>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const key = url.replace('https://r2.test/', '');
      const body = files.get(key);
      return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => JSON.parse(body!) };
    }));
  }

  it('loads the index through the manifest and a service on request', async () => {
    const release = buildOnDemandRelease('beta');
    serve(releaseFiles(release));
    const index = await loadOnDemandIndex('https://r2.test');
    expect(index.version).toBe(release.manifest.version);
    const geometry = await loadOnDemandGeometry(index, 'uta', 'https://r2.test');
    expect(geometry.features.length).toBeGreaterThan(0);
  });

  it('fails instead of guessing when the manifest is missing or from another schema', async () => {
    serve(new Map());
    await expect(loadOnDemandIndex('https://r2.test')).rejects.toThrow();
    const release = buildOnDemandRelease('beta');
    const files = releaseFiles(release);
    files.set('manifest.json', JSON.stringify({ ...release.manifest, schemaVersion: 99 }));
    serve(files);
    await expect(loadOnDemandIndex('https://r2.test')).rejects.toThrow(/schema/);
  });
});

describe('temporary zones past their last day (CIV-50)', () => {
  it('leaves an ended zone, its hours and its own stops out of the release, by the agency\'s local date', () => {
    // Edmonton's Glenora detour runs until 2026-12-31. At 2027-01-01 03:00 UTC it is still
    // Dec 31 in Edmonton, so the zone stays; by 2027-01-01 08:00 UTC it's gone.
    const zones = (now: string) => {
      const release = buildOnDemandRelease('beta', 't', undefined, undefined, new Date(now));
      const geometry = release.geometries.find(g => g.slug === 'edmonton')!;
      const meta = release.index.services.find(s => s.slug === 'edmonton')!.area as unknown as { zoneMetadata: Record<string, unknown> };
      return { names: geometry.features.map(f => (f.properties as { areaName: string }).areaName), meta: Object.keys(meta.zoneMetadata) };
    };
    const before = zones('2027-01-01T03:00:00Z');
    expect(before.names).toContain('Glenora East');
    const after = zones('2027-01-01T08:00:00Z');
    for (const name of ['Glenora East', 'Glenora West', '124 Street & 102 Avenue', '142 Street & Stony Plain Road']) {
      expect(after.names).not.toContain(name);
      expect(after.meta).not.toContain(name);
    }
    expect(after.names).toContain('Keswick');
  });
});
