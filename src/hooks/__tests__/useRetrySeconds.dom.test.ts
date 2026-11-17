import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { secondsUntil, useRetrySeconds } from '../useRetrySeconds';
import { liveRetryCountdown, liveUnableToLoadPill, LIVE_UNABLE_TO_LOAD } from '../../content/noticeCopy';

afterEach(() => vi.useRealTimers());

describe('Live retry countdown (CIV-1768)', () => {
  it('counts whole seconds down to the next try, never below 0', () => {
    expect(secondsUntil(15_000, 3_200)).toBe(12);
    expect(secondsUntil(15_000, 16_000)).toBe(0);
  });

  it('ticks once a second and stops with no next try', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = renderHook(({ at }) => useRetrySeconds(at), { initialProps: { at: 15_000 as number | null } });
    expect(result.current).toBe(15);
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(result.current).toBe(12);
    rerender({ at: null });
    expect(result.current).toBeNull();
  });

  it('reads as Ryan put it: "Unable to load", then the countdown', () => {
    expect(LIVE_UNABLE_TO_LOAD).toBe('Unable to load');
    expect(liveRetryCountdown(12)).toBe('Retrying in 12s');
    // The map's loading pill (Ryan: "Yes" to "Unable to load · Retrying in 11s").
    expect(liveUnableToLoadPill(11)).toBe('Unable to load · Retrying in 11s');
  });
});
