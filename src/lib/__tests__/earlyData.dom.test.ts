import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDataReleaseCache, resolveDataRelease } from '../dataRelease';
import { takeEarlyHeader } from '../earlyData';
import { RetryingFetchSource } from '../pmtilesRetrySource';
import { TILE_RULES_VERSION } from '../../../shared/artifactSchema';

const release = {
  releaseId: 'release-test',
  pmtilesKey: 'atlas/releases/release-test/atlas.pmtiles',
  overviewPmtilesKey: 'atlas/releases/release-test/atlas-overview.pmtiles',
  agencyPrefix: 'atlas/releases/release-test/agencies',
  routeArtifactSchemaVersion: 2,
  tileRulesVersion: TILE_RULES_VERSION,
};

afterEach(() => {
  clearDataReleaseCache();
  delete (window as { __atlasEarly?: unknown }).__atlasEarly;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requests started by index.html', () => {
  it('uses the early release.json without a second request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    window.__atlasEarly = { base: 'https://data.example', release: Promise.resolve({ status: 200, value: release }), header: {} };
    await expect(resolveDataRelease('https://data.example/')).resolves.toMatchObject({ releaseId: 'release-test' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to its own request when the early one failed', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => release });
    vi.stubGlobal('fetch', fetchSpy);
    window.__atlasEarly = { base: 'https://data.example', release: Promise.resolve(null), header: {} };
    await expect(resolveDataRelease('https://data.example')).resolves.toMatchObject({ releaseId: 'release-test' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('still rejects an incompatible early pointer and keeps a 404 as no release', async () => {
    vi.stubGlobal('fetch', vi.fn());
    window.__atlasEarly = { base: 'https://data.example', release: Promise.resolve({ status: 200, value: { releaseId: 'x' } }), header: {} };
    await expect(resolveDataRelease('https://data.example')).resolves.toBeNull();
    clearDataReleaseCache();
    window.__atlasEarly = { base: 'https://data.example', release: Promise.resolve({ status: 404 }), header: {} };
    await expect(resolveDataRelease('https://data.example')).resolves.toBeNull();
  });

  it('ignores an early pointer for a different data URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => release });
    vi.stubGlobal('fetch', fetchSpy);
    window.__atlasEarly = { base: 'https://other.example', release: Promise.resolve({ status: 200, value: { ...release, releaseId: 'release-other' } }), header: {} };
    await expect(resolveDataRelease('https://data.example')).resolves.toMatchObject({ releaseId: 'release-test' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('hands over an early header once and the source uses it for the first 16 KB only', async () => {
    const url = 'https://atlas.test/api/atlas-pmtiles?release_id=release-test';
    const data = new Uint8Array([1, 2, 3]).buffer;
    window.__atlasEarly = { base: 'https://data.example', release: Promise.resolve(null), header: { [url]: Promise.resolve({ data, etag: '"abc"' }) } };
    const source = new RetryingFetchSource(url);
    await expect(source.getBytes(0, 16384)).resolves.toEqual({ data, etag: '"abc"' });
    expect(takeEarlyHeader(url)).toBeNull();
  });

  it('drops a weak etag like the PMTiles library does', async () => {
    const url = 'https://atlas.test/api/atlas-pmtiles?release_id=release-test';
    window.__atlasEarly = { base: '', release: Promise.resolve(null), header: { [url]: Promise.resolve({ data: new ArrayBuffer(1), etag: 'W/"x"' }) } };
    const result = await new RetryingFetchSource(url).getBytes(0, 16384);
    expect(result.etag).toBeUndefined();
  });
});
