import { act, renderHook } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useMissingLinkCard } from '../useMissingLinkCard';

const catalog = [{ slug: 'ttc' }, { slug: 'capmetro' }];

/** The map's side of the hook: its stop and on-demand selections, cleared the way Interval clears them. */
function useMap({ stop = null, onDemand = null, onDemandSlugs = null, onDemandEnabled = true }: {
  stop?: string | null; onDemand?: string | null; onDemandSlugs?: ReadonlySet<string> | null; onDemandEnabled?: boolean;
}) {
  const [selectedStop, setSelectedStop] = useState(stop);
  const [onDemandSelection, setOnDemandSelection] = useState(onDemand);
  const [routeOpen, setRouteOpen] = useState(false);
  const clearSelection = useCallback(() => { setSelectedStop(null); setOnDemandSelection(null); }, []);
  const clearOnDemand = useCallback(() => setOnDemandSelection(null), []);
  const card = useMissingLinkCard({
    selectedStop, onDemandSelection, catalog, onDemandSlugs, onDemandEnabled, clearSelection, clearOnDemand, otherSelectionOpen: routeOpen,
  });
  return { ...card, selectedStop, onDemandSelection, openRoute: () => setRouteOpen(true) };
}

describe('useMissingLinkCard (#1191)', () => {
  it('a real ?ondemand= service that is only in the on-demand list survives until that list loads, and after', () => {
    const { result, rerender } = renderHook(p => useMap(p), { initialProps: { onDemand: 'grande-prairie-on-demand' } as Parameters<typeof useMap>[0] });
    // The on-demand list hasn't loaded, and the service isn't in the agency catalog: the link is left alone.
    expect(result.current.onDemandSelection).toBe('grande-prairie-on-demand');
    expect(result.current.missing).toBeNull();
    // The list loads with the service in it: still open, no note.
    rerender({ onDemand: 'grande-prairie-on-demand', onDemandSlugs: new Set(['grande-prairie-on-demand', 'capmetro']) });
    expect(result.current.onDemandSelection).toBe('grande-prairie-on-demand');
    expect(result.current.missing).toBeNull();
  });

  it('an ?ondemand= service in neither list is dropped once the on-demand list loads, with its note', () => {
    const { result, rerender } = renderHook(p => useMap(p), { initialProps: { onDemand: 'nope' } as Parameters<typeof useMap>[0] });
    expect(result.current.onDemandSelection).toBe('nope');
    rerender({ onDemand: 'nope', onDemandSlugs: new Set(['grande-prairie-on-demand']) });
    expect(result.current.onDemandSelection).toBeNull();
    expect(result.current.missing).toBe('onDemand');
  });

  it('a garbled ?ondemand= is dropped at once; nothing happens where on-demand is off', () => {
    const on = renderHook(() => useMap({ onDemand: 'NOPE!!' }));
    expect(on.result.current.onDemandSelection).toBeNull();
    expect(on.result.current.missing).toBe('onDemand');
    const off = renderHook(() => useMap({ onDemand: 'NOPE!!', onDemandEnabled: false }));
    expect(off.result.current.onDemandSelection).toBe('NOPE!!');
    expect(off.result.current.missing).toBeNull();
  });

  it('a garbled or unknown-agency ?stop= is dropped with the stop note; a known agency is left to its data', () => {
    for (const stop of ['garbage', 'nope::5']) {
      const { result } = renderHook(() => useMap({ stop }));
      expect(result.current.selectedStop).toBeNull();
      expect(result.current.missing).toBe('stop');
    }
    const { result } = renderHook(() => useMap({ stop: 'ttc::nope' }));
    expect(result.current.selectedStop).toBe('ttc::nope');
    expect(result.current.missing).toBeNull();
  });

  it('the note gives way when something else opens, and Close dismisses it', () => {
    const a = renderHook(() => useMap({ stop: 'garbage' }));
    expect(a.result.current.missing).toBe('stop');
    act(() => a.result.current.openRoute());
    expect(a.result.current.missing).toBeNull();
    const b = renderHook(() => useMap({ stop: 'garbage' }));
    act(() => b.result.current.dismiss());
    expect(b.result.current.missing).toBeNull();
  });
});
