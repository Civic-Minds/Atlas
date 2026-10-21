import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecentSearches } from '../useRecentSearches';

const KEY = 'atlas_recent_searches';
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('useRecentSearches (#1028 item 22)', () => {
  it('reads the saved searches when the bar gets focus', () => {
    localStorage.setItem(KEY, JSON.stringify(['marta']));
    const { result, rerender } = renderHook(({ focused }) => useRecentSearches(focused), { initialProps: { focused: false } });
    expect(result.current.recentSearches).toEqual([]);
    rerender({ focused: true });
    expect(result.current.recentSearches).toEqual(['marta']);
  });

  it('saves newest first, without repeats (any case), trimmed, five at most', () => {
    const { result } = renderHook(() => useRecentSearches(true));
    for (const q of ['a', 'b', 'c', 'd', 'e', 'f']) act(() => result.current.saveRecentSearch(q));
    expect(result.current.recentSearches).toEqual(['f', 'e', 'd', 'c', 'b']);
    act(() => result.current.saveRecentSearch('  C  '));
    expect(result.current.recentSearches).toEqual(['C', 'f', 'e', 'd', 'b']);
    act(() => result.current.saveRecentSearch('   '));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['C', 'f', 'e', 'd', 'b']);
  });

  it('clears the list and the store', () => {
    const { result } = renderHook(() => useRecentSearches(true));
    act(() => result.current.saveRecentSearch('marta'));
    act(() => result.current.clearRecentSearches());
    expect(result.current.recentSearches).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
