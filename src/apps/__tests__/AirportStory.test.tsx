import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// The story map's MapLibre worker URL is a Vite build import (?worker&url) the test runner can't load; no map is drawn here.
vi.mock('../../lib/maplibreWorker', () => ({}));
// Unlike the Frequent Service map, the airport map is built on first render, and jsdom has no WebGL2: a stand-in map that never loads.
vi.mock('maplibre-gl', () => ({
  Map: class {
    private container: HTMLElement;
    constructor(options: { container: HTMLElement }) { this.container = options.container; }
    on() { return this; }
    getContainer() { return this.container; }
    getSource() { return undefined; }
    getLayer() { return undefined; }
    resize() {}
    fitBounds() {}
    remove() {}
  },
}));
// The map's route files (TTC's is about 24 MB) are never fetched in tests.
vi.mock('../../lib/agencyGeo', () => ({ fetchAgencyGeo: () => new Promise(() => {}) }));
import AirportStory from '../AirportStory';
import { AIRPORTS, landableAt } from '../../data/airportHourly';
import { AIRPORT_STORY_DRAFT } from '../../../shared/researchStories';

describe('AirportStory (CIV-1550, dev only)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  });

  it('is registered only through the dev-only draft list, so no public or beta build has it', () => {
    const drafts = readFileSync('src/apps/researchDrafts.ts', 'utf8');
    // The list is empty unless import.meta.env.DEV: with DEV false, Vite drops the route, the /research card and the chunk.
    expect(drafts).toMatch(/RESEARCH_DRAFTS: readonly ResearchDraft\[\] = import\.meta\.env\.DEV\s*\?/);
    // Its address and words come from its registry entry (CIV-1629).
    expect(drafts).toContain('href: AIRPORT_STORY_DRAFT.path');
    expect(AIRPORT_STORY_DRAFT.path).toBe('/research/airports/story');
    expect(drafts).toContain("React.lazy(() => import('./AirportStory'))");
    const main = readFileSync('src/main.tsx', 'utf8');
    const start = main.indexOf('{import.meta.env.DEV && (');
    expect(start).toBeGreaterThan(-1);
    expect(main.indexOf('RESEARCH_DRAFTS.map(')).toBeGreaterThan(start);
    // Nothing imports the page directly.
    expect(main).not.toContain('AirportStory');
    // Not in the site's route lists (sitemap, prerender) or the published research list.
    for (const f of ['shared/config.ts', 'shared/rules/flags.ts', 'shared/seo.ts', 'src/data/research.ts']) expect(readFileSync(f, 'utf8')).not.toContain('/research/airports');
  });

  it('shows the scroll story draft: title placeholder, the weekday map section, the follow-up sections and the method', () => {
    render(<AirportStory />);
    expect(screen.getByRole('heading', { level: 1, name: '[Placeholder: title]' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'One weekday at the airports' })).toBeInTheDocument();
    for (const name of ['[Placeholder: week grid heading]', 'The weekend gap', 'Not quite downtown', 'How far you can get', 'Find your airport']) expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    expect(screen.queryByText(/Before publishing/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Method' })).toBeInTheDocument();
  });

  it('keeps the reader’s theme through the night: no blend to dark (Ryan’s pick, 2026-11-16)', () => {
    const page = readFileSync('src/apps/AirportStory.tsx', 'utf8');
    expect(page).not.toContain('nightBlend');
    // The hour steps are the Frequent service story's IntersectionObserver steps, one per hour.
    expect(page).toContain('new IntersectionObserver(');
    const { container } = render(<AirportStory />);
    expect(container.querySelectorAll('[data-hour-step]')).toHaveLength(25);
  });

    it('Memphis has no weekday departure in the 11 AM and 12 PM hours, and its last downtown hour is 4 PM (the 11 AM card)', () => {
    const mem = AIRPORTS.find(a => a.code === 'MEM')!;
    expect(landableAt(mem, 'wk', 10, 'any')).toBe(true);
    expect(landableAt(mem, 'wk', 11, 'any')).toBe(false);
    expect(landableAt(mem, 'wk', 12, 'any')).toBe(false);
    // The card's 4:34 PM: the last weekday hour with a ride downtown is 4 PM.
    expect(Array.from({ length: 24 }, (_, h) => h).filter(h => landableAt(mem, 'wk', h)).at(-1)).toBe(16);
  });
});
