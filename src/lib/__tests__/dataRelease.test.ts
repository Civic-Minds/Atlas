import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDataReleaseCache, dataReleaseApiUrl, dataReleaseAssetUrl, isCompatibleDataRelease, resolveDataRelease } from '../dataRelease';
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
    expect(dataReleaseApiUrl(release!.releaseId)).toBe('/api/atlas-pmtiles?release_id=release-test');
    expect(dataReleaseApiUrl(release!.releaseId, 'overview')).toBe('/api/atlas-pmtiles?release_id=release-test&variant=overview');
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

  it('treats a release without a tile-rules stamp as the baseline rules', () => {
    expect(isCompatibleDataRelease(complete)).toBe((TILE_RULES_VERSION as number) === 1);
  });

  it('rejects a release whose tiles were built under different rules than this app', () => {
    expect(isCompatibleDataRelease({ ...complete, tileRulesVersion: TILE_RULES_VERSION })).toBe(true);
    expect(isCompatibleDataRelease({ ...complete, tileRulesVersion: TILE_RULES_VERSION + 1 })).toBe(false);
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
