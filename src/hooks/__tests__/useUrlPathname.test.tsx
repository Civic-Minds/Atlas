import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUrlPathname } from '../useUrlPathname';

describe('useUrlPathname', () => {
  it('follows pushState, replaceState and back/forward at once', () => {
    window.history.replaceState(null, '', '/apps/live');
    const { result } = renderHook(() => useUrlPathname());
    expect(result.current).toBe('/apps/live');
    act(() => { window.history.pushState(null, '', '/'); });
    expect(result.current).toBe('/');
    act(() => { window.history.replaceState(null, '', '/apps/history'); });
    expect(result.current).toBe('/apps/history');
    act(() => {
      window.history.replaceState(null, '', '/apps/live');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current).toBe('/apps/live');
  });
});
