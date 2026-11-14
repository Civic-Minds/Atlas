import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LABEL_MAX_WAIT_MS, MODE_ENTER_MAX_WAIT_MS, ModeEnter, MODE_EASE_MS, ModeSplitPane, modeFadeIn, useMapDrawn, useModeEasing, useModeEntering, useShownWhenDrawn } from '../ModeTransition';

/**
 * A stand-in map. `fireIdle` plays MapLibre's idle event (everything loaded and drawn); `fireRender` plays one
 * drawn frame, with `tilesLoaded` saying whether every tile had loaded by then.
 */
function fakeMap() {
  const handlers: Record<string, Set<() => void>> = { idle: new Set(), render: new Set() };
  const map = {
    tilesLoaded: false,
    on: vi.fn((event: string, fn: () => void) => { handlers[event].add(fn); }),
    once: vi.fn((event: string, fn: () => void) => { handlers[event].add(fn); }),
    off: vi.fn((event: string, fn: () => void) => { handlers[event].delete(fn); }),
    areTilesLoaded: () => map.tilesLoaded,
    triggerRepaint: vi.fn(),
    fireIdle() { const fns = [...handlers.idle]; handlers.idle.clear(); fns.forEach(fn => fn()); },
    fireRender() { [...handlers.render].forEach(fn => fn()); },
  };
  return map as any;
}

describe('ModeEnter (CIV-1567)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('adds nothing when the switch is off: no cover, no wrapper', () => {
    const { container } = render(<ModeEnter enabled={false} ready={false} label="Loading map…"><p>view</p></ModeEnter>);
    expect(container.innerHTML).toBe('<p>view</p>');
  });

  it('covers the view with the loading label until it is ready, then fades it in', () => {
    const { rerender } = render(<ModeEnter enabled ready={false} label="Loading map…"><p>view</p></ModeEnter>);
    expect(screen.getByText('view').parentElement?.dataset.modeEnter).toBe('waiting');
    expect(screen.getByText('view').parentElement?.className).toContain('opacity-0');
    expect(screen.getByText('Loading map…')).toBeTruthy();
    rerender(<ModeEnter enabled ready label="Loading map…"><p>view</p></ModeEnter>);
    expect(screen.getByText('view').parentElement?.dataset.modeEnter).toBe('shown');
    // The label goes as the fade starts, so it never shows through the half-faded view; the plain panel stays under it.
    expect(screen.queryByText('Loading map…')).toBeNull();
    expect(document.querySelector('[data-mode-enter="cover"]')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(document.querySelector('[data-mode-enter="cover"]')).toBeNull();
  });

  it('never keeps the cover up past the longest wait', () => {
    render(<ModeEnter enabled ready={false} label="Loading map…"><p>view</p></ModeEnter>);
    act(() => { vi.advanceTimersByTime(MODE_ENTER_MAX_WAIT_MS); });
    expect(screen.getByText('view').parentElement?.dataset.modeEnter).toBe('shown');
  });
});

describe('useModeEntering, ModeSplitPane and modeFadeIn (CIV-1567)', () => {
  it('is true for the first frames after the mode turns on, then false', () => {
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.push(cb); return frames.length; });
    const { result, rerender } = renderHook(({ active }) => useModeEntering(active, true), { initialProps: { active: false } });
    expect(result.current).toBe(false);
    rerender({ active: true });
    expect(result.current).toBe(true);
    act(() => { frames.shift()?.(0); });
    expect(result.current).toBe(true);
    act(() => { frames.shift()?.(0); });
    expect(result.current).toBe(false);
    raf.mockRestore();
  });

  it('never reports entering with the switch off', () => {
    const { result, rerender } = renderHook(({ active }) => useModeEntering(active, false), { initialProps: { active: false } });
    rerender({ active: true });
    expect(result.current).toBe(false);
  });

  it('the pane starts at zero width while entering and adds nothing with the switch off', () => {
    const { container, rerender } = render(<ModeSplitPane enabled anchor="left" easing entering width="50vw" className="relative flex-1"><p>map</p></ModeSplitPane>);
    const pane = container.firstElementChild as HTMLElement;
    expect(pane.style.flexGrow).toBe('0');
    expect((screen.getByText('map').parentElement as HTMLElement).style.width).toBe('50vw');
    rerender(<ModeSplitPane enabled anchor="left" easing={false} entering={false} width="50vw" className="relative flex-1"><p>map</p></ModeSplitPane>);
    expect(pane.style.flexGrow).toBe('1');
    const off = render(<ModeSplitPane enabled={false} anchor="left" easing entering width="50vw" className="relative flex-1"><p>off</p></ModeSplitPane>);
    expect(off.container.innerHTML).toBe('<div class="relative flex-1"><p>off</p></div>');
  });

  it('the old full-screen pane keeps its content at the old width, centred, only while the split eases', () => {
    const { rerender } = render(<ModeSplitPane enabled anchor="center" entering easing width="100vw" className="relative flex-1"><p>map</p></ModeSplitPane>);
    const box = screen.getByText('map').parentElement as HTMLElement;
    expect(box.style.width).toBe('100vw');
    expect(box.style.transform).toBe('translateX(-50%)');
    rerender(<ModeSplitPane enabled anchor="center" entering={false} easing={false} width="100vw" className="relative flex-1"><p>map</p></ModeSplitPane>);
    expect(screen.getByText('map').parentElement).toBe(box);
    expect(box.style.width).toBe('');
    expect(box.style.right).toBe('0px');
  });

  it('fades new controls in from transparent, and has no classes with the switch off', () => {
    expect(modeFadeIn(true, true)).toContain('opacity-0');
    expect(modeFadeIn(true, false)).toContain('opacity-100');
    expect(modeFadeIn(true, false)).toContain('motion-reduce:transition-none');
    expect(modeFadeIn(false, true)).toBe('');
  });
});

describe('useModeEasing (CIV-1567)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is true from the mode turning on until the ease has finished', () => {
    const { result, rerender } = renderHook(({ active }) => useModeEasing(active, true), { initialProps: { active: false } });
    rerender({ active: true });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(MODE_EASE_MS); });
    expect(result.current).toBe(false);
  });
});

describe('useMapDrawn (CIV-1567)', () => {
  it('is true once the map has drawn, and false again for a new map', () => {
    const a = fakeMap();
    const { result, rerender } = renderHook(({ map }) => useMapDrawn(map, true), { initialProps: { map: a } });
    expect(result.current).toBe(false);
    act(() => a.fireIdle());
    expect(result.current).toBe(true);
    const b = fakeMap();
    rerender({ map: b });
    expect(result.current).toBe(false);
  });

  it('is always true with the switch off', () => {
    const { result } = renderHook(() => useMapDrawn(fakeMap(), false));
    expect(result.current).toBe(true);
  });
});

describe('useShownWhenDrawn (CIV-1567)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the old label until the map has redrawn', () => {
    const map = fakeMap();
    const { result, rerender } = renderHook(({ value }) => useShownWhenDrawn(value, map, true), { initialProps: { value: 'Weekday midday' } });
    act(() => map.fireIdle());
    rerender({ value: 'Saturday midday' });
    expect(result.current).toBe('Weekday midday');
    act(() => map.fireIdle());
    expect(result.current).toBe('Saturday midday');
  });

  it('changes the label in the frame that draws the last tile, not on a frame still loading', () => {
    const map = fakeMap();
    const { result, rerender } = renderHook(({ value }) => useShownWhenDrawn(value, map, true), { initialProps: { value: 'midday' } });
    act(() => map.fireIdle());
    rerender({ value: 'late' });
    act(() => map.fireRender());
    expect(result.current).toBe('midday');
    map.tilesLoaded = true;
    act(() => map.fireRender());
    expect(result.current).toBe('late');
  });

  it('never waits past the longest wait', () => {
    const map = fakeMap();
    const { result, rerender } = renderHook(({ value }) => useShownWhenDrawn(value, map, true), { initialProps: { value: 'a' } });
    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(LABEL_MAX_WAIT_MS); });
    expect(result.current).toBe('b');
  });

  it('follows the value at once with the switch off', () => {
    const map = fakeMap();
    const { result, rerender } = renderHook(({ value }) => useShownWhenDrawn(value, map, false), { initialProps: { value: 'a' } });
    rerender({ value: 'b' });
    expect(result.current).toBe('b');
    expect(map.once).not.toHaveBeenCalled();
  });
});
