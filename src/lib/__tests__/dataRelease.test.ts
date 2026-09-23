import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDataReleaseCache, dataReleaseAssetUrl, resolveDataRelease } from '../dataRelease';

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
      }),
    }));

    const release = await resolveDataRelease('https://data.example');
    expect(release?.releaseId).toBe('release-test');
    expect(dataReleaseAssetUrl(release!, release!.pmtilesKey, 'https://data.example'))
      .toBe('https://data.example/atlas/releases/release-test/atlas.pmtiles?v=release-test');
  });

  it('rejects an incomplete pointer so callers can use the legacy fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releaseId: 'incomplete' }),
    }));

    await expect(resolveDataRelease('https://data.example')).resolves.toBeNull();
  });
});
