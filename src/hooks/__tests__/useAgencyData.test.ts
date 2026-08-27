import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Agency } from '../../App';
import type { ViewportBounds } from '../useIntervalStats';

const fetchAgencyGeo = vi.fn();

vi.mock('../../lib/agencyGeo', () => ({
  fetchAgencyGeo: (...args: unknown[]) => fetchAgencyGeo(...args),
  getCachedAgencyGeo: () => undefined,
  fetchAgencyCorridors: vi.fn(),
  getCachedAgencyCorridors: () => undefined,
}));

const { useAgencyData } = await import('../useAgencyData');

function agency(slug: string, lat = 43.65, lon = -79.38): Agency {
  return { slug, name: slug, center: [lat, lon], url: `https://example.test/${slug}.json` };
}

const viewport: ViewportBounds = { s: 43, w: -80, n: 44, e: -79 };
const emptyFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

describe('useAgencyData failure handling', () => {
  beforeEach(() => {
    fetchAgencyGeo.mockReset();
  });

  it('retries a failed agency fetch once before marking it failed, and does not mark a fetch that succeeds on retry', async () => {
    fetchAgencyGeo.mockRejectedValueOnce(new Error('network down'));
    fetchAgencyGeo.mockResolvedValueOnce(emptyFc);

    // Stable reference across re-renders -- an inline array literal here would get
    // recreated every render and retrigger useAgencyData's [agencies]-keyed reset effect.
    const agencies = [agency('good-agency')];
    const { result } = renderHook(() => useAgencyData(agencies, viewport));

    await waitFor(() => expect(fetchAgencyGeo).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.failedSlugs.has('good-agency')).toBe(false);
    expect(result.current.layers['good-agency']).toBeDefined();
  });

  it('marks an agency as failed only after both the initial attempt and the retry fail', async () => {
    fetchAgencyGeo.mockRejectedValue(new Error('still down'));

    const agencies = [agency('bad-agency')];
    const { result } = renderHook(() => useAgencyData(agencies, viewport));

    await waitFor(() => expect(fetchAgencyGeo).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.failedSlugs.has('bad-agency')).toBe(true));

    expect(result.current.layers['bad-agency']).toBeUndefined();
    // loadedCount must reach requestedCount exactly once per agency, not once per attempt --
    // otherwise isLoading desyncs and either gets stuck true or flips false too early.
    expect(result.current.loadedCount).toBe(result.current.requestedCount);
    expect(result.current.isLoading).toBe(false);
  });

  it('does not double-count loadedCount against requestedCount when a retry occurs', async () => {
    fetchAgencyGeo
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce(emptyFc)
      .mockResolvedValueOnce(emptyFc);

    const agencies = [agency('flaky-agency'), agency('fine-agency', 43.66, -79.37)];
    const { result } = renderHook(() => useAgencyData(agencies, viewport));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requestedCount).toBe(2);
    expect(result.current.loadedCount).toBe(2);
  });
});
