import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const status = vi.hoisted(() => ({ value: { data: null as unknown, settled: true } }));
vi.mock('../useSegmentDelay', () => ({ useSegmentDelayStatus: () => status.value }));

import { useLiveTripDirections } from '../useLiveTripDirections';

const car = (id: string, tripId: string, directionId: number | null) => ({ id, tripId, directionId });
const timetable = { tripDirections: { 0: ['t1', 't2'] } };

describe('useLiveTripDirections (#1164, CIV-1068)', () => {
  it("gives each listed trip's direction in the map's numbering, with no route card mounted", () => {
    status.value = { data: timetable, settled: true };
    // The map calls the analysis's direction 0 its direction 1 (learned from a and b); a third car on a listed trip
    // whose map guess was the other way (d) gets the map's 1 too. t9 isn't in the timetable: nothing is claimed.
    const { result } = renderHook(() => useLiveTripDirections('ttc', '505', [car('a', 't1', 1), car('b', 't2', 1), car('d', 't2', 0), car('c', 't9', 0)]));
    expect(result.current).toEqual({ byVehicle: new Map([['a', 1], ['b', 1], ['d', 1]]), settled: true });
  });

  it('claims nothing until the map knows a direction to pair with', () => {
    status.value = { data: timetable, settled: true };
    const { result } = renderHook(() => useLiveTripDirections('ttc', '505', [car('a', 't1', null)]));
    expect(result.current.byVehicle).toBeNull();
  });

  it('is not settled while the timetable loads', () => {
    status.value = { data: null, settled: false };
    const { result } = renderHook(() => useLiveTripDirections('ttc', '505', [car('a', 't1', 1)]));
    expect(result.current).toEqual({ byVehicle: null, settled: false });
  });

  it('keeps the same map across polls while the answer is unchanged', () => {
    status.value = { data: timetable, settled: true };
    const { result, rerender } = renderHook(({ v }) => useLiveTripDirections('ttc', '505', v), { initialProps: { v: [car('a', 't1', 1)] } });
    const first = result.current.byVehicle;
    rerender({ v: [car('a', 't1', 1)] });
    expect(result.current.byVehicle).toBe(first);
  });
});
