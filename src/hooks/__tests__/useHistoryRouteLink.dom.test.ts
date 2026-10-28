import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHistoryRouteLink } from '../useHistoryRouteLink';

const MARTA = { marta: { features: [{ properties: { routeId: '29182', routeShortName: '117' } }] } };
const setUrl = (search: string) => window.history.replaceState(null, '', `/apps/history${search}`);
afterEach(() => setUrl(''));

describe('useHistoryRouteLink (#1028 item 24)', () => {
  it('a map route link opens the agency at once, then the route once its map routes load', () => {
    setUrl('?route=marta%3A%3A29182');
    const openRoute = vi.fn();
    const { rerender } = renderHook(({ inHistory, layers }) => useHistoryRouteLink({ inHistory, layers, openRoute }), { initialProps: { inHistory: true, layers: {} as typeof MARTA | Record<string, never> } });
    expect(openRoute).toHaveBeenCalledWith({ slug: 'marta', routeShortName: '' });
    setUrl(''); // the map drops its route param; the key was read as History opened
    rerender({ inHistory: true, layers: MARTA });
    expect(openRoute).toHaveBeenLastCalledWith({ slug: 'marta', routeShortName: '117' });
    rerender({ inHistory: true, layers: { ...MARTA } });
    expect(openRoute).toHaveBeenCalledTimes(2);
  });

  it("History's own link wins", () => {
    setUrl('?agency=marta&hroute=6&route=marta%3A%3A29182');
    const openRoute = vi.fn();
    renderHook(() => useHistoryRouteLink({ inHistory: true, layers: MARTA, openRoute }));
    expect(openRoute).not.toHaveBeenCalled();
  });

  it('switching from the map keeps the open route', () => {
    window.history.replaceState(null, '', '/?route=marta%3A%3A29182');
    const openRoute = vi.fn();
    const { result, rerender } = renderHook(({ inHistory }) => useHistoryRouteLink({ inHistory, layers: MARTA, openRoute }), { initialProps: { inHistory: false } });
    act(() => result.current.noteHistorySwitch());
    setUrl(''); // the switch navigates without the map's params
    rerender({ inHistory: true });
    expect(openRoute).toHaveBeenLastCalledWith({ slug: 'marta', routeShortName: '117' });
  });

  it('an unknown route id opens the agency only', () => {
    setUrl('?route=marta%3A%3Anope');
    const openRoute = vi.fn();
    renderHook(() => useHistoryRouteLink({ inHistory: true, layers: MARTA, openRoute }));
    expect(openRoute).toHaveBeenCalledTimes(1);
    expect(openRoute).toHaveBeenCalledWith({ slug: 'marta', routeShortName: '' });
  });
});
