import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageContents, { activeSectionIndex } from '../PageContents';

const ITEMS = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }];
const VIEWPORT = 800;

function renderWithSections() {
  return render(
    <main>
      <PageContents items={ITEMS} />
      {ITEMS.map(item => <section key={item.id} id={item.id}>{item.label} text</section>)}
    </main>,
  );
}

/** Place the sections (their tops relative to the window) and the page's scroll position, then fire a scroll. */
function scrollTo(tops: Record<string, number>, scrollTop = 500, scrollHeight = 10000) {
  for (const [id, top] of Object.entries(tops)) {
    document.getElementById(id)!.getBoundingClientRect = () => ({ top } as DOMRect);
  }
  Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, value: scrollTop });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: scrollHeight });
  act(() => { window.dispatchEvent(new Event('scroll')); });
}

const current = () => screen.queryAllByRole('link').filter(link => link.getAttribute('aria-current') === 'location').map(link => link.textContent);

describe('activeSectionIndex (#1275)', () => {
  it('is the last section whose top has passed the reading line', () => {
    expect(activeSectionIndex([-900, -100, 400], VIEWPORT, 5000)).toBe(1);
    expect(activeSectionIndex([-1200, 90, 700], VIEWPORT, 5000)).toBe(1);
  });

  it('keeps the earlier section while the next heading is still below the line', () => {
    expect(activeSectionIndex([-2000, 300], VIEWPORT, 5000)).toBe(0);
  });

  it('is null before the first section starts', () => {
    expect(activeSectionIndex([200, 900], VIEWPORT, 5000)).toBeNull();
  });

  it('counts a section whose heading landed under the header after a link or click', () => {
    expect(activeSectionIndex([-1192, 84], VIEWPORT, 5000)).toBe(1);
  });

  it('gives short sections near the end their turn, and the last section the very bottom', () => {
    const tops = [-3000, 200, 450, 650];
    expect(activeSectionIndex(tops, VIEWPORT, 5000)).toBe(0);
    expect(activeSectionIndex(tops, VIEWPORT, 600)).toBe(1);
    expect(activeSectionIndex(tops, VIEWPORT, 300)).toBe(2);
    expect(activeSectionIndex(tops, VIEWPORT, 0)).toBe(3);
  });
});

describe('PageContents scroll-spy', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    // Runs the frame at once; returns 0 so the hook sees no frame pending.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document.documentElement as unknown as Record<string, unknown>).scrollTop;
    delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
  });

  it('marks the section being read as the current location', () => {
    renderWithSections();
    expect(current()).toEqual([]);
    scrollTo({ one: 40, two: 900, three: 2000 });
    expect(current()).toEqual(['One']);
    scrollTo({ one: -900, two: 100, three: 1000 });
    expect(current()).toEqual(['Two']);
  });

  it('follows a jump that lands between two sections (#1275)', () => {
    renderWithSections();
    scrollTo({ one: 40, two: 900, three: 2000 });
    scrollTo({ one: -3000, two: -1500, three: 300 });
    expect(current()).toEqual(['Two']);
  });

  it('activates a clicked item right away and holds it while the page scrolls there', () => {
    renderWithSections();
    scrollTo({ one: 40, two: 900, three: 2000 });
    fireEvent.click(screen.getByRole('link', { name: 'Three' }));
    expect(current()).toEqual(['Three']);
    scrollTo({ one: -900, two: 100, three: 1000 });
    expect(current()).toEqual(['Three']);
  });

  it('activates the last section at the very bottom of the page', () => {
    renderWithSections();
    scrollTo({ one: -9000, two: -500, three: 600 }, 10000 - window.innerHeight);
    expect(current()).toEqual(['Three']);
  });

  it('clears the highlight back at the top of the page', () => {
    renderWithSections();
    scrollTo({ one: -900, two: 100, three: 1000 });
    expect(current()).toEqual(['Two']);
    scrollTo({ one: 300, two: 1300, three: 2300 }, 0);
    expect(current()).toEqual([]);
  });
});
