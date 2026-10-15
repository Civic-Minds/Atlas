import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDataReleaseCache, loadDataReleases, resolveReleaseHistory, dataReleasePmtilesUrl, dataReleaseAssetUrl, isCompatibleDataRelease, resolveDataRelease } from '../dataRelease';
import { ROUTE_ARTIFACT_SCHEMA_VERSION, TILE_RULES_VERSION } from '../../../shared/artifactSchema';

afterEach(() => {
  clearDataReleaseCache();
  vi.restoreAllMocks();
});

describe('data releases', () => {
  it('accepts only a complete release pointer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        releaseId: 'release-test',
        pmtilesKey: 'atlas/releases/release-test/atlas.pmtiles',
        overviewPmtilesKey: 'atlas/releases/release-test/atlas-overview.pmtiles',
        agencyPrefix: 'atlas/releases/release-test/agencies',
        routeArtifactSchemaVersion: 2,
        tileRulesVersion: TILE_RULES_VERSION,
      }),
    }));

    const release = await resolveDataRelease('https://data.example');
    expect(release?.releaseId).toBe('release-test');
    expect(dataReleaseAssetUrl(release!, release!.pmtilesKey, 'https://data.example'))
      .toBe('https://data.example/atlas/releases/release-test/atlas.pmtiles?v=release-test');
  });

  it('rejects an incomplete pointer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releaseId: 'incomplete' }),
    }));

    await expect(resolveDataRelease('https://data.example')).resolves.toBeNull();
  });

  const complete = {
    releaseId: 'release-test',
    pmtilesKey: 'atlas/releases/release-test/atlas.pmtiles',
    overviewPmtilesKey: 'atlas/releases/release-test/atlas-overview.pmtiles',
    agencyPrefix: 'atlas/releases/release-test/agencies',
    routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
  };
  const stamped = { ...complete, tileRulesVersion: TILE_RULES_VERSION };

  it('rejects a release without a tile-rules stamp (counts as v1)', () => {
    expect(isCompatibleDataRelease(complete)).toBe(false);
  });

  it('rejects a release whose tiles were built under rules this app does not accept', () => {
    expect(isCompatibleDataRelease({ ...complete, tileRulesVersion: TILE_RULES_VERSION })).toBe(true);
    for (const version of [0, 1, 2, 5]) expect(isCompatibleDataRelease({ ...complete, tileRulesVersion: version })).toBe(false);
    expect(isCompatibleDataRelease({ ...complete, tileRulesVersion: 'x' as unknown as number })).toBe(false);
  });

  it('retries the release pointer once after a server error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, status: 200, json: async () => stamped });
    vi.stubGlobal('fetch', fetchMock);
    await expect(resolveDataRelease('https://data.example')).resolves.toMatchObject({ releaseId: 'release-test' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries the release pointer once after a network error', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, json: async () => stamped });
    vi.stubGlobal('fetch', fetchMock);
    await expect(resolveDataRelease('https://data.example')).resolves.toMatchObject({ releaseId: 'release-test' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('release history', () => {
  it('reads the history file and drops malformed entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ releaseId: 'release-a', generatedAt: '2026-10-01T00:00:00Z' }, { releaseId: 'bad', generatedAt: 'x' }, null],
    }));
    expect(await resolveReleaseHistory('https://data.example')).toEqual([{ releaseId: 'release-a', generatedAt: '2026-10-01T00:00:00Z' }]);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://data.example/atlas/release-history.json');
  });

  it('returns null when the history is missing or the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await resolveReleaseHistory('https://data.example')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await resolveReleaseHistory('https://data.example')).toBeNull();
  });

  it('falls back to the live pointer when there is no history, and adds it when the history lags', async () => {
    const latest = { releaseId: 'release-b', generatedAt: '2026-10-12T00:00:00Z' };
    expect(await loadDataReleases(async () => null, async () => latest)).toEqual([latest]);
    const old = { releaseId: 'release-a', generatedAt: '2026-10-01T00:00:00Z' };
    expect(await loadDataReleases(async () => [old], async () => latest)).toEqual([old, latest]);
    expect(await loadDataReleases(async () => { throw new Error('x'); }, async () => null)).toEqual([]);
  });

  describe('map tile URLs', () => {
    const release = {
      releaseId: 'release-test',
      pmtilesKey: 'atlas/releases/release-test/atlas.pmtiles',
      overviewPmtilesKey: 'atlas/releases/release-test/atlas-overview.pmtiles',
      agencyPrefix: 'atlas/releases/release-test/agencies',
      routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
    };

    it('deployed builds read the release archives straight from the public data domain, never a Vercel function', () => {
      expect(dataReleasePmtilesUrl(release, 'detail', true, 'https://www.transitatlas.fyi'))
        .toBe('https://data.transitatlas.fyi/atlas/releases/release-test/atlas.pmtiles?v=release-test');
      expect(dataReleasePmtilesUrl(release, 'overview', true))
        .toBe('https://data.transitatlas.fyi/atlas/releases/release-test/atlas-overview.pmtiles?v=release-test');
    });

    it('deployed builds without a verified release get a URL under no release, never the legacy root archive', () => {
      const detail = dataReleasePmtilesUrl(null, 'detail', true)!;
      const overview = dataReleasePmtilesUrl(null, 'overview', true)!;
      expect(detail).toBe('https://data.transitatlas.fyi/atlas/releases/unavailable/atlas.pmtiles');
      expect(overview).toBe('https://data.transitatlas.fyi/atlas/releases/unavailable/atlas-overview.pmtiles');
      for (const url of [detail, overview]) expect(url).not.toMatch(/\/api\//);
    });

    it('local development keeps its same-origin proxy and its legacy fallback', () => {
      expect(dataReleasePmtilesUrl(release, 'detail', false, 'http://localhost:5180/atlas-data'))
        .toBe('http://localhost:5180/atlas-data/atlas/releases/release-test/atlas.pmtiles?v=release-test');
      expect(dataReleasePmtilesUrl(null, 'detail', false)).toBeNull();
    });
  });
});
