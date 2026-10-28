import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorVisionProvider, useColorVision } from '../../context/ColorVisionContext';
import { useColorMode } from '../useColorMode';

const wrapper = ({ children }: { children: ReactNode }) => <ColorVisionProvider>{children}</ColorVisionProvider>;

describe('useColorMode', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows the colour-vision setting', () => {
    const { result } = renderHook(() => ({ mode: useColorMode(), set: useColorVision().setColorVisionFriendly }), { wrapper });
    expect(result.current.mode).toBe('default');
    act(() => result.current.set(true));
    expect(result.current.mode).toBe('friendly');
  });

  it('is default outside a provider', () => {
    expect(renderHook(() => useColorMode()).result.current).toBe('default');
  });
});
