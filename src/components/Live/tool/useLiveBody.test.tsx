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
