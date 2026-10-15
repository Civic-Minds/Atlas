import { StrictMode, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistedFilterPref } from '../usePersistedFilterPref';

const KEY = 'atlas_pref_headway';
let store: Map<string, string>;

beforeEach(() => {
  store = new Map([[KEY, '30']]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

function renderPref(value: string, fromUrl: boolean) {
  return renderHook(({ v }) => usePersistedFilterPref(KEY, v, fromUrl), { initialProps: { v: value }, wrapper });
}

describe('usePersistedFilterPref', () => {
  it('keeps the saved preference when a shared link supplies the value', () => {
    renderPref('10', true);
    expect(store.get(KEY)).toBe('30');
  });

  it('saves once the viewer changes a link-supplied value', () => {
    const { rerender } = renderPref('10', true);
    rerender({ v: '15' });
    expect(store.get(KEY)).toBe('15');
  });

  it('saves a change back to the link value after the viewer has changed it', () => {
    const { rerender } = renderPref('10', true);
    rerender({ v: '15' });
    rerender({ v: '10' });
    expect(store.get(KEY)).toBe('10');
  });

  it('saves on load when the value did not come from a link', () => {
    renderPref('60', false);
    expect(store.get(KEY)).toBe('60');
  });
});
