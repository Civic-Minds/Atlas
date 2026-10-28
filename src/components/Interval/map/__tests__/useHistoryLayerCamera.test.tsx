import { act, render } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryMapOverlayProvider, useHistoryMapOverlay, type HistoryMapOverlay } from '../../../../context/HistoryMapOverlay';
import { useHistoryLayer } from '../useHistoryLayer';

function fakeMap() {
  return {
    getSource: vi.fn(() => ({ setData: vi.fn() })),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getLayer: vi.fn(() => null),
    queryRenderedFeatures: vi.fn(() => []),
    getContainer: vi.fn(() => ({ clientWidth: 1440, clientHeight: 900 })),
  };
}

let setOverlay: (o: HistoryMapOverlay | null) => void = () => {};
function Harness({ map }: { map: ReturnType<typeof fakeMap> }) {
  const mapRef = useRef(map as never);
  useHistoryLayer(mapRef, true);
  const ctx = useHistoryMapOverlay();
  useEffect(() => { setOverlay = ctx.setOverlay; }, [ctx.setOverlay]);
  return null;
}

const shape = (x: number) => [[x, 0], [x + 1, 1]];
const overlay = (year: number, route = '', shapeX = year): HistoryMapOverlay => ({
  slug: 'marta',
  routeShortName: route,
  agencyCenter: [33.7, -84.4],
  selectedYear: year,
  routeGeometry: route ? shape(shapeX) : undefined,
  yearRoutes: [{ routeShortName: '117', color: '#000', headway: 30, coordinates: shape(shapeX) }],
});
const moves = (map: ReturnType<typeof fakeMap>) => map.fitBounds.mock.calls.length + map.flyTo.mock.calls.length;

describe('History camera (#1016)', () => {
  it('changing only the year does not move the map; changing the agency or route does', () => {
    const map = fakeMap();
    render(<HistoryMapOverlayProvider><Harness map={map} /></HistoryMapOverlayProvider>);
    act(() => setOverlay(overlay(2014)));
    const afterOpen = moves(map);
    expect(afterOpen).toBeGreaterThan(0);
    act(() => setOverlay(overlay(2015)));
    act(() => setOverlay(overlay(2022)));
    expect(moves(map)).toBe(afterOpen);
    act(() => setOverlay(overlay(2022, '117')));
    const afterRoute = moves(map);
    expect(afterRoute).toBeGreaterThan(afterOpen);
    act(() => setOverlay(overlay(2023, '117', 50)));
    expect(moves(map)).toBe(afterRoute);
    act(() => setOverlay({ ...overlay(2023), slug: 'rtd-denver' }));
    expect(moves(map)).toBeGreaterThan(afterRoute);
  });

  it('fits a route to its line at maxZoom 14 and an agency\'s own shapes at 11, beside the card on the right', () => {
    const map = fakeMap();
    render(<HistoryMapOverlayProvider><Harness map={map} /></HistoryMapOverlayProvider>);
    act(() => setOverlay(overlay(2014, '117', 3)));
    expect(map.fitBounds).toHaveBeenLastCalledWith([[3, 0], [4, 1]], { padding: { top: 80, bottom: 80, left: 80, right: 280 }, maxZoom: 14 });
    act(() => setOverlay({ ...overlay(2014), slug: 'rtd-denver' }));
    expect(map.fitBounds).toHaveBeenLastCalledWith([[2014, 0], [2015, 1]], { padding: { top: 80, bottom: 80, left: 80, right: 280 }, maxZoom: 11 });
  });

  it('frames a straight north-south line, and leaves a single point alone (no fly from a moveend)', () => {
    const map = fakeMap();
    render(<HistoryMapOverlayProvider><Harness map={map} /></HistoryMapOverlayProvider>);
    act(() => setOverlay({ ...overlay(2014), routeShortName: '1', routeGeometry: [[5, 0], [5, 2]] }));
    expect(map.fitBounds).toHaveBeenLastCalledWith([[5, 0], [5, 2]], expect.objectContaining({ maxZoom: 14 }));
    const fits = map.fitBounds.mock.calls.length;
    act(() => setOverlay({ ...overlay(2014), slug: 'other', routeShortName: '2', routeGeometry: [[5, 1], [5, 1]] }));
    expect(map.fitBounds.mock.calls.length).toBe(fits);
  });
});

