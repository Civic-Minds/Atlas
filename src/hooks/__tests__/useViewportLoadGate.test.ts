import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useViewportLoadGate } from '../useViewportLoadGate';

afterEach(() => vi.useRealTimers());

describe('useViewportLoadGate', () => {
  it('stays closed until tiles have started and settled', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ loading }) => useViewportLoadGate(loading), { initialProps: { loading: false } });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
    rerender({ loading: true });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
    rerender({ loading: false });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe(true);
  });

  it('opens after the maximum wait if the tiles never report', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useViewportLoadGate(false));
    act(() => { vi.advanceTimersByTime(8100); });
    expect(result.current).toBe(true);
  });
});
