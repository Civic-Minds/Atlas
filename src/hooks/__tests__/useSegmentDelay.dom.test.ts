import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #1750: the dev server runs with Live mode off while Studio is on; Studio's route panel still reads the route.
vi.mock('../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: false } };
});

import { useSegmentDelayStatus } from '../useSegmentDelay';

const reading = { agency: 'ttc', route: '506', segments: [], headways: [], directionLabels: { 0: 'Westbound' } };

describe('route reading with Live mode off (#1750)', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => reading }))); });
  afterEach(() => vi.unstubAllGlobals());

  it('reads nothing by default: the shared Live gate is unchanged', () => {
    const { result } = renderHook(() => useSegmentDelayStatus('ttc', '506'));
    expect(result.current).toEqual({ data: null, settled: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the route when the caller turns it on', async () => {
    const { result } = renderHook(() => useSegmentDelayStatus('ttc', '506', true));
    await waitFor(() => expect(result.current.data).toEqual(reading));
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain('/api/live-segments?agency=ttc&route=506');
  });
});
