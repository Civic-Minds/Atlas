import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FADE_OUT_MS, useFadePresence } from '../useFadePresence';

afterEach(() => vi.useRealTimers());

describe('useFadePresence', () => {
  it('mounts at once and fades in just after', () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ open }) => useFadePresence(open), { initialProps: { open: true } });
    expect(result.current).toEqual({ mounted: true, visible: false });
    act(() => { vi.advanceTimersByTime(10); });
    expect(result.current).toEqual({ mounted: true, visible: true });
  });

  it('starts unmounted when closed', () => {
    const { result } = renderHook(() => useFadePresence(false));
    expect(result.current).toEqual({ mounted: false, visible: false });
  });

  it('fades out at once and unmounts after the map card\'s 200ms', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ open }) => useFadePresence(open), { initialProps: { open: true } });
    act(() => { vi.advanceTimersByTime(10); });
    rerender({ open: false });
    expect(result.current).toEqual({ mounted: true, visible: false });
    expect(FADE_OUT_MS).toBe(200);
    act(() => { vi.advanceTimersByTime(199); });
    expect(result.current.mounted).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.mounted).toBe(false);
  });

  it('reopening during the fade-out keeps it mounted', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ open }) => useFadePresence(open), { initialProps: { open: true } });
    act(() => { vi.advanceTimersByTime(10); });
    rerender({ open: false });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ open: true });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toEqual({ mounted: true, visible: true });
  });
});
