import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadOnDemandIndex = vi.fn();
vi.mock('../../lib/onDemandLoader', () => ({
  loadOnDemandIndex: () => loadOnDemandIndex(),
  loadOnDemandGeometry: vi.fn(),
}));

import { ON_DEMAND_RETRY_MS, useOnDemandData } from '../useOnDemandData';

const INDEX = { schemaVersion: 1, version: 'v1', generatedAt: '', services: [] };

describe('useOnDemandData (CIV-50)', () => {
  afterEach(() => { vi.useRealTimers(); loadOnDemandIndex.mockReset(); });

  it('loads nothing until on-demand is shown', () => {
    renderHook(() => useOnDemandData(true));
    expect(loadOnDemandIndex).not.toHaveBeenCalled();
  });

  it('finishes a load that was in flight when on-demand was hidden, and never sticks at loading', async () => {
    let resolve!: (value: unknown) => void;
    loadOnDemandIndex.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useOnDemandData(true));
    act(() => result.current.setVisible(true));
    expect(result.current.status).toBe('loading');
    act(() => result.current.setVisible(false));
    await act(async () => { resolve(INDEX); });
    expect(result.current.status).toBe('ready');
    expect(result.current.index).toEqual(INDEX);
  });

  it('reloads when shown again after a load failed while hidden', async () => {
    loadOnDemandIndex.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(INDEX);
    const { result } = renderHook(() => useOnDemandData(true));
    act(() => result.current.setVisible(true));
    act(() => result.current.setVisible(false));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.setVisible(true));
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('retries a failed index on its own after a short wait, keeping the error until it loads', async () => {
    vi.useFakeTimers();
    loadOnDemandIndex.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(INDEX);
    const { result } = renderHook(() => useOnDemandData(true));
    act(() => result.current.setVisible(true));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe('error');
    await act(async () => { vi.advanceTimersByTime(ON_DEMAND_RETRY_MS); });
    await act(async () => { await Promise.resolve(); });
    expect(loadOnDemandIndex).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
  });
});
