import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNT_MAX_WAIT_MS, LABEL_MAX_WAIT_MS, MODE_ENTER_MAX_WAIT_MS, ModeCollapse, ModeEnter, MODE_EASE_MS, ModeSplitPane, modeFadeIn, modeFadeWhen, useChangedSince, useMapDrawn, useReadyOrTimeout, useModeEasing, useModeEntering, useShownWhenDrawn, useShownWithCount } from '../ModeTransition';

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
    // The label fades out (faster) as the view fades in, starting together, so there is no blank frame; the plain
    // panel stays under it.
    expect(screen.getByText('Loading map…').parentElement?.className).toContain('opacity-0');
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

  it('the new pane slides in as an empty panel and mounts its content once the ease ends; nothing extra with the switch off', () => {
    const { container, rerender } = render(<ModeSplitPane enabled anchor="left" easing entering divider="4px" className="relative flex-1"><p>map</p></ModeSplitPane>);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.dataset.modeEnter).toBe('sliding');
    expect(panel.style.transform).toBe('translateX(100%)');
    // Content waits for the ease, so setting up a map inside cannot stall the slide.
    expect(screen.queryByText('map')).toBeNull();
    rerender(<ModeSplitPane enabled anchor="left" easing entering={false} divider="4px" className="relative flex-1"><p>map</p></ModeSplitPane>);
    expect((container.firstElementChild as HTMLElement).style.transform).toBe('translateX(0px)');
    expect(screen.queryByText('map')).toBeNull();
    rerender(<ModeSplitPane enabled anchor="left" easing={false} entering={false} divider="4px" className="relative flex-1"><p>map</p></ModeSplitPane>);
    expect(screen.getByText('map').parentElement?.className).toBe('relative flex-1');
    const off = render(<ModeSplitPane enabled={false} anchor="left" easing entering divider="4px" className="relative flex-1"><p>off</p></ModeSplitPane>);
    expect(off.container.innerHTML).toBe('<div class="relative flex-1"><p>off</p></div>');
  });

  it('the old full-screen pane glides its content to its half with a transform only while the split eases', () => {
    const { rerender } = render(<ModeSplitPane enabled anchor="center" entering easing divider="4px" className="relative flex-1" overlay={<span>label</span>}><p>map</p></ModeSplitPane>);
    const box = screen.getByText('map').parentElement as HTMLElement;
    expect(box.style.transform).toBe('translateX(0px)');
    expect(box.style.width).toBe('');
    // The label sits in the finished half from the first frame.
    expect((screen.getByText('label').parentElement as HTMLElement).style.width).toBe('calc(50% - 2px)');
    rerender(<ModeSplitPane enabled anchor="center" entering={false} easing divider="4px" className="relative flex-1" overlay={<span>label</span>}><p>map</p></ModeSplitPane>);
    expect(box.style.transform).toBe('translateX(calc(-25% - 1px))');
    rerender(<ModeSplitPane enabled anchor="center" entering={false} easing={false} divider="4px" className="relative flex-1" overlay={<span>label</span>}><p>map</p></ModeSplitPane>);
    expect(screen.getByText('map').parentElement).toBe(box);
    expect(box.style.transform).toBe('');
    expect((screen.getByText('label').parentElement as HTMLElement).style.width).toBe('100%');
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
    const { result, rerender } = renderHook(({ active, entering }) => useModeEasing(active, true, entering), { initialProps: { active: false, entering: false } });
    rerender({ active: true, entering: true });
    expect(result.current).toBe(true);
    // A busy page can hold the starting frames for a long time; the ease is only counted once they are over.
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(true);
    rerender({ active: true, entering: false });
    act(() => { vi.advanceTimersByTime(MODE_EASE_MS - 1); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(false);
  });

  it('never holds anything for an ease with reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    const { result, rerender } = renderHook(({ active }) => useModeEasing(active, true, true), { initialProps: { active: false } });
    rerender({ active: true });
    expect(result.current).toBe(false);
    vi.unstubAllGlobals();
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

describe('ModeSplitPane placeholder, ModeCollapse (CIV-1567)', () => {
  it('shows the loading label on the sliding panel, so the half is never empty', () => {
    render(<ModeSplitPane enabled anchor="left" easing entering={false} divider="4px" className="relative flex-1" placeholder={<span>Loading map…</span>}><p>map</p></ModeSplitPane>);
    expect(screen.getByText('Loading map…').closest('[data-mode-enter="sliding"]')).not.toBeNull();
  });

  it('keeps controls mounted while folding them away, hidden from screen readers', () => {
    const { rerender } = render(<ModeCollapse open><button>Day</button></ModeCollapse>);
    const day = screen.getByText('Day');
    rerender(<ModeCollapse open={false}><button>Day</button></ModeCollapse>);
    expect(screen.getByText('Day', { selector: 'button' })).toBe(day);
    expect(day.closest('[data-mode-collapse]')?.getAttribute('aria-hidden')).toBe('true');
    expect(day.closest('[data-mode-collapse]')?.className).toContain('grid-cols-[0fr]');
  });
});

describe('useShownWithCount (CIV-1567)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('holds a new label until its count arrives, then shows both together', () => {
    const c1 = { total: 131 }, c2 = { total: 96 }, c3 = { total: 90 };
    const { result, rerender } = renderHook(({ label, count }) => useShownWithCount(label, count, true), { initialProps: { label: 'midday', count: c1 } });
    expect(result.current).toEqual(['midday', c1]);
    rerender({ label: 'late', count: c1 });
    expect(result.current).toEqual(['midday', c1]);
    rerender({ label: 'late', count: c2 });
    expect(result.current).toEqual(['late', c2]);
    // Panning: same label, the count follows at once.
    rerender({ label: 'late', count: c3 });
    expect(result.current).toEqual(['late', c3]);
  });

  it('never holds a label longer than the count wait, and passes through with the switch off', () => {
    const c1 = { total: 1 };
    const { result, rerender } = renderHook(({ label }) => useShownWithCount(label, c1, true), { initialProps: { label: 'a' } });
    rerender({ label: 'b' });
    expect(result.current[0]).toBe('a');
    act(() => { vi.advanceTimersByTime(COUNT_MAX_WAIT_MS); });
    expect(result.current[0]).toBe('b');
    const off = renderHook(({ label }) => useShownWithCount(label, c1, false), { initialProps: { label: 'a' } });
    off.rerender({ label: 'b' });
    expect(off.result.current[0]).toBe('b');
  });
});

describe('modeFadeWhen and useReadyOrTimeout (CIV-1567)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('hides a label until its count is there, then fades it in; nothing with the switch off', () => {
    expect(modeFadeWhen(true, false)).toContain('opacity-0');
    expect(modeFadeWhen(true, true)).toContain('transition-opacity');
    expect(modeFadeWhen(false, false)).toBe('');
  });

  it('is ready with the signal, or after the longest wait without it', () => {
    const { result, rerender } = renderHook(({ ready, active }) => useReadyOrTimeout(ready, active, true), { initialProps: { ready: false, active: true } });
    expect(result.current).toBe(false);
    rerender({ ready: true, active: true });
    expect(result.current).toBe(true);
    rerender({ ready: false, active: true });
    act(() => { vi.advanceTimersByTime(MODE_ENTER_MAX_WAIT_MS); });
    expect(result.current).toBe(true);
  });
});

describe('useChangedSince (CIV-1567)', () => {
  it('is true only once a new value has come in after the moment started', () => {
    const a = { total: 200 }, b = { total: 136 };
    const { result, rerender } = renderHook(({ value, since }) => useChangedSince(value, since), { initialProps: { value: a, since: false } });
    expect(result.current).toBe(false);
    rerender({ value: a, since: true });
    expect(result.current).toBe(false);
    rerender({ value: b, since: true });
    expect(result.current).toBe(true);
  });
});
