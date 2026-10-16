import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageContents from '../PageContents';

type Callback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
let observerCallback: Callback | null = null;

class FakeIntersectionObserver {
  constructor(callback: Callback) { observerCallback = callback; }
  observe() {}
  disconnect() {}
}

const ITEMS = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }];

function renderWithSections() {
  return render(
    <main>
      <PageContents items={ITEMS} />
      {ITEMS.map(item => <section key={item.id} id={item.id}>{item.label} text</section>)}
    </main>,
  );
}

function band(id: string, isIntersecting: boolean) {
  act(() => observerCallback?.([{ target: document.getElementById(id)!, isIntersecting }]));
}

const current = () => screen.queryAllByRole('link').filter(link => link.getAttribute('aria-current') === 'location').map(link => link.textContent);

describe('PageContents scroll-spy', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    Element.prototype.scrollIntoView = vi.fn();
    // Scrolled a little way down a long page, so neither the top-of-page nor the bottom-of-page rule applies.
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 10000 });
    Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, value: 500 });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document.documentElement as unknown as Record<string, unknown>).scrollTop;
    delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
    observerCallback = null;
  });

  it('marks the section under the header as the current location', () => {
    renderWithSections();
    expect(current()).toEqual([]);
    band('one', true);
    expect(current()).toEqual(['One']);
    band('one', false);
    band('two', true);
    expect(current()).toEqual(['Two']);
  });

  it('keeps the previous section active in the gap between sections', () => {
    renderWithSections();
    band('two', true);
    band('two', false);
    expect(current()).toEqual(['Two']);
  });

  it('activates a clicked item right away and holds it while the page scrolls there', () => {
    renderWithSections();
    band('one', true);
    fireEvent.click(screen.getByRole('link', { name: 'Three' }));
    expect(current()).toEqual(['Three']);
    band('one', false);
    band('two', true);
    expect(current()).toEqual(['Three']);
  });

  it('activates the last section at the very bottom of the page', () => {
    renderWithSections();
    band('one', true);
    const root = document.documentElement;
    Object.defineProperty(root, 'scrollTop', { configurable: true, value: 10000 - window.innerHeight });
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(current()).toEqual(['Three']);
  });

  it('clears the highlight back at the top of the page', () => {
    renderWithSections();
    band('two', true);
    expect(current()).toEqual(['Two']);
    Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, value: 0 });
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(current()).toEqual([]);
  });
});
