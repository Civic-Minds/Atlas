import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The Live analysis file per route, resolved by the test when it chooses (CIV-1043).
const pending = new Map<string, (v: unknown) => void>();
vi.mock('../../lib/liveDashboardFetch', () => ({
  fetchLiveDashboard: (_agency: string, route: string) => new Promise(resolve => { pending.set(route, resolve); }),
}));

import { useRouteAnalysis, useRouteAnalysisPatterns } from '../useRouteAnalysisPatterns';
import { cardTripEnd } from '../../components/Live/vehicleCardModel';

const file = (stop: string) => ({ status: 'ready', v3: { runningTime: { patterns: { 0: [{ kind: 'main', fromName: 'High Park Loop', toName: 'Main St at Danforth Ave' }] } }, stops: [{ name: stop }] } });

describe('the vehicle card reads the route analysis only when it is there (CIV-1043)', () => {
  it('asks only while a vehicle card is open', () => {
    pending.clear();
    renderHook(() => useRouteAnalysisPatterns('ttc', '506', false));
    expect(pending.size).toBe(0);
  });

  it('gives no tag while the file loads, then the route\'s own, and none after a switch until the new one loads', async () => {
    pending.clear();
    const { result, rerender } = renderHook(({ route }) => useRouteAnalysisPatterns('ttc', route, true), { initialProps: { route: '506' } });
    expect(result.current).toBeNull();
    expect(cardTripEnd('Spadina', 'High Park', result.current)).toBeUndefined();
    await act(async () => { pending.get('506')!(file('College St at Spadina Ave')); });
    expect(cardTripEnd('Spadina', 'High Park', result.current)).toBe('shortTurn');
    rerender({ route: '504' });
    // The 506 file must never tag a 504 card.
    expect(result.current).toBeNull();
    expect(cardTripEnd('Spadina', 'High Park', result.current)).toBeUndefined();
  });

  it('says when the answer is in, so the card waits instead of guessing (CIV-1068)', async () => {
    pending.clear();
    const { result } = renderHook(({ route }) => useRouteAnalysis('ttc', route, true), { initialProps: { route: '504' } });
    expect(result.current).toEqual({ value: null, settled: false });
    await act(async () => { pending.get('504')!({ status: 'unknown_route', reason: '' }); });
    expect(result.current).toEqual({ value: null, settled: true });
  });
});
