import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSidebarAnchor } from '../useSidebarAnchor';

// #1792: a map card sat ~55px right of the search bar (Barrie Zone D) because the bar moved when the logo's wordmark
// changed width, while nothing the old measurement watched changed size.
const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 40, height: 40, x: left, y: 0, toJSON: () => ({}) });

describe('useSidebarAnchor (#1792)', () => {
  let observed: Element[] = [];
  let fire: () => void = () => {};
  afterEach(() => { vi.unstubAllGlobals(); observed = []; });

  it('follows the search bar when the logo changes width', () => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { fire = cb; }
      observe(el: Element) { observed.push(el); }
      disconnect() {}
    });
    const row = document.createElement('div');
    const logo = document.createElement('a');
    row.appendChild(logo);
    const bar = document.createElement('div');
    let barLeft = 149;
    bar.getBoundingClientRect = () => rect(barLeft, 252) as DOMRect;
    const { result } = renderHook(() => useSidebarAnchor({ current: bar }, { current: row }));
    expect(result.current).toEqual({ sidebarLeft: 149, searchBarWidth: 252 });
    // The wordmark narrows: the bar moves left, the page and the bar keep their size.
    expect(observed).toContain(logo);
    expect(observed).toContain(row);
    barLeft = 94;
    act(() => fire());
    expect(result.current.sidebarLeft).toBe(94);
  });
});

describe('one left edge for map cards (#1792 guard)', () => {
  const root = resolve(__dirname, '../../..');
  it('App reads the edge from useSidebarAnchor and measures nothing itself', () => {
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
    expect(app).toContain('useSidebarAnchor(searchBarRef, headerLeftRef)');
    expect(app).not.toMatch(/setSidebarLeft\s*\(/);
  });
});

describe('no card sets its own left offset (#1792 guard)', () => {
  it('every arbitrary left edge in src is the shared --sidebar-left', async () => {
    const { execSync } = await import('node:child_process');
    const root = resolve(__dirname, '../../..');
    const hits = execSync(`grep -rnoE "left-\\\\[[^]]+\\\\]" src || true`, { cwd: root, encoding: 'utf8' })
      .split('\n').filter(l => l && !l.includes('__tests__') && !l.includes('var(--sidebar-left'));
    expect(hits).toEqual([]);
  });
});

describe('cards and top-bar notes share the card slot (#1792 guard)', () => {
  const root = resolve(__dirname, '../../..');
  const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
  it("the History/Live note opens at the cards' left edge, not the window's", () => {
    const note = read('src/components/ModeUnavailableNote.tsx');
    // #1917: the shared left edge and the search bar's width, as every left card.
    expect(note).toContain('${SIDEBAR_LEFT_EDGE}');
    expect(note).toContain('sidebarFrameStyle(sidebarLeft, searchBarWidth)');
  });
  it("in Compare every card frame takes the shared compare placement, below map A's filter pill", async () => {
    const { sidebarFrameStyle } = await import('../../styles');
    const { COMPARE_PANEL_TOP } = await import('../../utils/format');
    // Below map A's pill row, at the same search-bar edge as everywhere else.
    expect(sidebarFrameStyle(149, 252, { top: COMPARE_PANEL_TOP })).toMatchObject({ top: `${COMPARE_PANEL_TOP}px`, '--sidebar-left': '149px' });
    // The route card frame passes it; every other sidebar card is a Panel, which reads the main map's compare top.
    expect(read('src/components/Interval/SidebarControls.tsx')).toMatch(/sidebarFrameStyle\([^)]*compareTop != null \? \{ top: compareTop \}/);
    expect(read('src/components/ui/Panel.tsx')).toContain('useCompareCardTop()');
    expect(read('src/apps/Interval.tsx')).toContain('<CompareCardTopProvider top={comparePanelTop(compareActive, searchFocused, query)}>');
  });
});
