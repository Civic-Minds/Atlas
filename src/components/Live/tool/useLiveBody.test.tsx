import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AgencySummary } from '../../../../shared/liveAgency';

// A route is open and its data is still loading: nothing has arrived from the network, the route's own file or the time-loss files.
const NO_ROUTES = new Map();
vi.mock('./useNetworkData', () => ({ default: () => NO_ROUTES }));
vi.mock('./useTimeLossReports', () => ({ useTimeLossData: () => NO_ROUTES }));
vi.mock('../../../hooks/useLiveDashboard', () => ({ useLiveDashboard: () => ({ kind: 'loading' }) }));

const { useLiveBody } = await import('./useLiveBody');

const s = { routes: [], held: [], weekly: null, daily: {}, worstStops: [], delayStarts: [], bunchingForms: [] } as unknown as AgencySummary;
const noop = () => {};

describe('useLiveBody while an open route loads (#1649)', () => {
  it("hands Studio's page overlay the same values on every render, so it doesn't re-render without end", () => {
    const { result, rerender } = renderHook(() => useLiveBody({
      agency: 'ttc', agencyName: 'TTC', s, route: '501', setRoute: noop, dir: null, setDir: noop, band: 'all',
      measure: null, pick: null, setPick: noop, inStudio: true,
    }));
    const first = result.current;
    rerender();
    expect(result.current.dataDates).toBe(first.dataDates);
    expect(result.current.model).toBe(first.model);
    expect(result.current.card).toBe(first.card);
  });
});

// #1748: an empty-map click or Escape (a null pick) dismisses like the main map: the open route closes with its pick.
describe('useLiveBody dismissal (#1748)', () => {
  it('closes the open route on a null pick, and only clears the pick with no route open', () => {
    const setRoute = vi.fn(), setPick = vi.fn();
    const args = { agency: 'ttc', agencyName: 'TTC', s, setRoute, dir: null, setDir: noop, band: 'all' as const, measure: null, pick: null, setPick, inStudio: true };
    const open = renderHook(() => useLiveBody({ ...args, route: '501' }));
    open.result.current.onMapPick(null);
    expect(setRoute).toHaveBeenCalledWith(null);
    expect(setPick).toHaveBeenCalledWith(null);
    setRoute.mockClear(); setPick.mockClear();
    const network = renderHook(() => useLiveBody({ ...args, route: null }));
    network.result.current.onMapPick(null);
    expect(setRoute).not.toHaveBeenCalled();
    expect(setPick).toHaveBeenCalledWith(null);
  });
});
