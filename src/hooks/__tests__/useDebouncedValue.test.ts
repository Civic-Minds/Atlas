import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebouncedValue } from '../useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a'));
    expect(result.current).toBe('a');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('a');
  });

  it('updates to the latest value once the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('b');
  });

  it('collapses rapid changes to only the final value -- never gets stuck on an intermediate one', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: '' },
    });
    for (const ch of ['o', 'or', 'ora', 'oran', 'orang', 'orange']) {
      rerender({ value: ch });
      act(() => { vi.advanceTimersByTime(50); }); // well under the 150ms delay
    }
    expect(result.current).toBe('');
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('orange');
  });

  it('keeps updating on every settled value, not just the first one (regression for #495)', () => {
    // The original bug: a stuck value that never caught up again after one
    // update. Confirm a second, later change also flows through correctly.
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: 'bart' },
    });
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('bart');

    rerender({ value: 'caltrain' });
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('caltrain');

    rerender({ value: 'wmata' });
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe('wmata');
  });
});
