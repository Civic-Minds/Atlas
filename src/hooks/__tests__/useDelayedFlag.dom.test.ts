import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useDelayedFlag } from '../useDelayedFlag';

afterEach(() => vi.useRealTimers());

describe('useDelayedFlag', () => {
  it('stays false for a quick load and turns true only after the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 150), { initialProps: { active: true } });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ active: false });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(false);
    rerender({ active: true });
    act(() => { vi.advanceTimersByTime(160); });
    expect(result.current).toBe(true);
  });
});
