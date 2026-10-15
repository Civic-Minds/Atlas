import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgencyPage from '../AgencyPage';
import AreaPage from '../AreaPage';
import { agencyPageData, type AgencyPageRoute, type AgencyPageSummary } from '../../shared/agencyPages';
import { buildAreaPageData } from '../../shared/areaPages';
import type { AreaConfig } from '../../shared/areas';

const r = (name: string, mode: number, midday: number | null, extra: Partial<AgencyPageRoute> = {}): AgencyPageRoute =>
  ({ name, longName: null, mode, midday, am: midday, pm: midday, evening: midday, overnight: null, ...extra });
const TTC: AgencyPageSummary = {
  slug: 'ttc', name: 'Toronto Transit Commission', displayName: 'TTC (Toronto)', city: 'Toronto', region: 'Ontario', country: 'Canada',
  routeCount: 5, span: { first: 5, last: 28 }, lastRefreshedAt: '2026-08-27', sat: true, sun: true,
  routes: [r('1', 1, 4), r('2', 1, 20), r('5', 3, 12), r('6', 3, 30), r('301', 3, null, { am: null, pm: null, evening: null, overnight: 30 })],
};
const HSR: AgencyPageSummary = { ...TTC, slug: 'hsr', name: 'Hamilton Street Railway', displayName: 'HSR (Hamilton)', city: 'Hamilton', routes: [r('A', 3, 10), r('B', 3, 25)], routeCount: 2, sat: true, sun: false };
const AREA: AreaConfig = {
  slug: 'toronto', name: 'Toronto', type: 'CMA', officialName: 'Toronto', country: 'Canada', cities: ['Toronto'], bbox: [43, -80, 44, -79], center: [43.5, -79.5],
  largeMetro: true, page: true, agencies: ['ttc', 'hsr'],
};

function view(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('AgencyPage', () => {
  const data = agencyPageData(TTC, [TTC, HSR], '2026-10-13T00:00:00Z', { slug: 'toronto', name: 'Toronto' });

  it('shows the full agency name in the heading, the area link, plain stats and the five period columns', () => {
    view(<AgencyPage data={data} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Toronto Transit Commission');
    expect(screen.getByRole('link', { name: 'Greater Toronto and Hamilton Area' }).getAttribute('href')).toBe('/area/toronto');
    expect(screen.queryByText('every 16 min')).toBeNull(); // no average wait stat
    expect(screen.getAllByText('every 4 min').length).toBeGreaterThan(0);
    expect(screen.queryByText('24 h')).toBeNull(); // service hours stat removed
    expect(screen.queryByText(/quickest route/)).toBeNull(); // quickest-route stat removed
    expect(screen.queryByText('Night only')).toBeNull();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent).slice(0, 6)).toEqual(['Route', 'AM peak', 'Midday', 'PM peak', 'Evening', 'Overnight']);
    expect(screen.getAllByText('every 30 min').length).toBeGreaterThan(0);
    expect(screen.queryByText(/frequent routes|frequent service/i)).toBeNull();
  });

  it('shows the frequency band bar with counts and no fixed threshold', () => {
    view(<AgencyPage data={data} />);
    expect(screen.queryByText(/15 min or better/)).toBeNull();
    expect(screen.getByRole('button', { name: /1 route every 10 min or better/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /route every 16–20 min/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /with no regular midday service/ })).toBeTruthy();
    expect(screen.queryByRole('tooltip')).toBeNull(); // no tooltip: the legend item is highlighted instead
    const segment = screen.getByRole('button', { name: /route every 16–20 min/ });
    const other = screen.getByRole('button', { name: /1 route every 10 min or better/ });
    fireEvent.focus(segment);
    const legend16 = document.querySelector('li[data-active="true"]')!;
    expect(legend16.textContent).toContain('16–20');
    expect((other as HTMLElement).style.opacity).toBe('0.35');
    expect((segment as HTMLElement).style.opacity).toBe('1');
    fireEvent.blur(segment);
    expect(document.querySelector('li[data-active="true"]')).toBeNull();
    expect((other as HTMLElement).style.opacity).toBe('1');
    // and the other way round: hovering a legend item highlights it and fades the other segments
    const item = [...document.querySelectorAll('li')].find(li => li.textContent!.includes('16–20'))!;
    fireEvent.mouseEnter(item);
    expect(item.getAttribute('data-active')).toBe('true');
    expect((other as HTMLElement).style.opacity).toBe('0.35');
    fireEvent.mouseLeave(item);
    expect((other as HTMLElement).style.opacity).toBe('1');
    expect(screen.queryByText(/pick a standard/i)).toBeNull();
  });

  it('has one map link under the bar (Weekday midday, every route); the bar and its legend are not links', () => {
    view(<AgencyPage data={data} />);
    expect(screen.queryByRole('link', { name: /route every/ })).toBeNull();
    const link = screen.getByRole('link', { name: 'See these routes on the map' });
    const url = new URL(link.getAttribute('href')!, 'http://x');
    expect([url.pathname, url.searchParams.get('agencies'), url.searchParams.get('h'), url.searchParams.get('p'), url.searchParams.get('day')]).toEqual(['/', 'ttc', 'all', 'midday', 'Weekday']);
    expect(link.querySelector('svg')).toBeTruthy(); // the shared page-link arrow
  });

  it('hides a stat it cannot compute instead of showing a blank', () => {
    const bare = { ...TTC, span: null, routes: [r('x', 3, null)], sat: undefined, sun: undefined };
    view(<AgencyPage data={agencyPageData(bare, [bare], null)} />);
    expect(screen.queryByText('typical wait, weekday midday')).toBeNull();
    expect(screen.queryByText(/weekday service/)).toBeNull();
  });
});

describe('AgencyPage intro', () => {
  const withConns = { ...TTC, stops: 7566, connections: [
    { slug: 'hsr', name: 'HSR', routes: ['1 King'] },
    { slug: 'nopage', name: 'Tiny Transit', routes: ['A'] },
    { slug: 'c', name: 'C', routes: ['x'] },
    { slug: 'd', name: 'D', routes: ['y'] },
  ] };

  it('says it once under the title, linking connecting agencies that have a page and counting the rest', () => {
    const d = agencyPageData(withConns, [withConns, HSR], null);
    expect(d.intro).toBe('Toronto Transit Commission operates 5 routes (2 subway/metro, 3 bus) in Toronto with 7,566 stops and connects with Hamilton Street Railway, Tiny Transit, C and 1 other agency.');
    view(<AgencyPage data={d} />);
    const p = screen.getByText(/operates 5 routes \(2 subway\/metro, 3 bus\) in Toronto with 7,566 stops/);
    expect(p.textContent).toBe(d.intro);
    expect(document.body.textContent!.split('operates 5 routes (').length - 1).toBe(1);
    expect(screen.getAllByRole('link', { name: 'Hamilton Street Railway' })[0].getAttribute('href')).toBe('/agency/hsr');
    expect(screen.queryByRole('link', { name: 'Tiny Transit' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Connects with' })).toBeNull();
    expect(screen.queryByTitle(/150 m/)).toBeNull();
  });

  it('has no connects-with clause without connections', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC, HSR], null)} />);
    expect(screen.queryByText(/connects with/)).toBeNull();
  });
});

describe('AgencyPage intro place, notes and headings', () => {
  const um = { ...TTC, slug: 'um', name: 'University of Michigan Transit Services (Toronto)', city: 'Toronto', stops: 12, websiteUrl: 'https://example.org' };

  it('links the place to its area page and drops the repeated city from the name', () => {
    const d = agencyPageData(um, [um, HSR], '2026-10-13T00:00:00Z', { slug: 'toronto', name: 'Toronto' });
    expect(d.intro.startsWith('University of Michigan Transit Services operates 5 routes')).toBe(true);
    view(<AgencyPage data={d} />);
    expect(screen.getByRole('link', { name: 'Toronto' }).getAttribute('href')).toBe('/area/toronto');
    expect(screen.getByRole('link', { name: 'University of Michigan Transit Services' }).getAttribute('href')).toBe('https://example.org');
    expect(screen.getByText(/Agency website:/)).toBeTruthy();
    expect(screen.getByText(/Based on the agency's published timetable, not live arrivals\./)).toBeTruthy();
  });

  it('has the bar note and counts without brackets', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC, HSR], null)} />);
    expect(screen.getByRole('link', { name: /See all agencies/ }).getAttribute('href')).toBe('/agencies');
    expect(screen.getByText("The bar splits this agency's routes by how often they run on a weekday midday. Each route is judged by its slower direction.")).toBeTruthy();
    expect(screen.queryByText(/sustained/)).toBeNull();
    const caption = screen.getAllByText(/^Subway/)[0];
    expect(caption.textContent).toBe('Subway/Metro 2');
    expect(caption.querySelector('span')?.className).toContain('font-normal');
  });
});

describe('AgencyPage other agencies list', () => {
  it('is titled by the area, links the area, and links every agency', () => {
    const withArea = agencyPageData(TTC, [TTC, HSR], null, { slug: 'toronto', name: 'Toronto' }, [TTC, HSR]);
    expect(withArea.nearby.map(n => n.slug)).toEqual(['hsr']);
    view(<AgencyPage data={withArea} />);
    const heading = screen.getByRole('heading', { name: 'Nearby agencies in the Greater Toronto and Hamilton Area' });
    expect(heading.querySelector('a')?.getAttribute('href')).toBe('/area/toronto');
    expect(screen.getByRole('link', { name: 'Hamilton Street Railway' }).getAttribute('href')).toBe('/agency/hsr');
  });

  it('keeps "Nearby agencies" when there is no area page', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC, HSR], null)} />);
    expect(screen.getByRole('heading', { name: 'Nearby agencies' })).toBeTruthy();
  });
});

describe('AreaPage', () => {
  const data = buildAreaPageData(AREA, new Map([[TTC.slug, TTC], [HSR.slug, HSR]]), '2026-10-13T00:00:00Z');

  it('lists agencies in a table with only the mode columns the area has, and links each agency', () => {
    view(<AreaPage data={data} />);
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toEqual(['Agency', 'Subway/Metro', 'Bus']);
    expect(screen.getByRole('link', { name: 'Toronto Transit Commission' }).getAttribute('href')).toBe('/agency/ttc');
    const ttcRow = screen.getByRole('link', { name: 'Toronto Transit Commission' }).closest('tr')!;
    const hsrRow = screen.getByRole('link', { name: 'Hamilton Street Railway' }).closest('tr')!;
    expect(hsrRow.textContent).toContain('–'); // no subway routes
  });

  it('shows the band bar and no fixed threshold', () => {
    view(<AreaPage data={data} />);
    expect(screen.queryByText(/15 min or better/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /every 10 min or better/ }).length).toBeGreaterThan(0);
  });

  it('has one map link under the bar framed on the area, and "See all agencies" in the section heading row', () => {
    view(<AreaPage data={data} />);
    expect(screen.queryByRole('link', { name: /route every/ })).toBeNull();
    const url = new URL(screen.getByRole('link', { name: 'See these routes on the map' }).getAttribute('href')!, 'http://x');
    expect([url.searchParams.get('area'), url.searchParams.get('h'), url.searchParams.get('p'), url.searchParams.get('day')]).toEqual(['toronto', 'all', 'midday', 'Weekday']);
    const seeAll = screen.getByRole('link', { name: 'See all agencies' });
    expect(seeAll.parentElement).toBe(screen.getByRole('heading', { name: 'Agencies and weekday frequency' }).parentElement);
    expect(screen.queryByText(/A dash means none/)).toBeNull();
  });
});

describe('not found is never shown while loading', () => {
  // The dev server loads page data after the first render; make the tests take that path.
  beforeEach(() => { vi.stubEnv('DEV', true); });
  afterEach(() => { vi.unstubAllEnvs(); });
  const at = (path: string, element: ReactElement, route: string) =>
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter>);

  it('agency page: blank first, the page once its data resolves, not-found only for a missing slug', async () => {
    const { unmount } = at('/agency/ttc', <AgencyPage />, '/agency/:slug');
    expect(screen.queryByText('No page for this agency')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 25000 });
    expect(screen.queryByText('No page for this agency')).toBeNull();
    unmount();
    at('/agency/no-such-agency', <AgencyPage />, '/agency/:slug');
    expect(screen.queryByText('No page for this agency')).toBeNull();
    await waitFor(() => expect(screen.getByText('No page for this agency')).toBeTruthy(), { timeout: 25000 });
  }, 60000);

  it('area page: blank first, not-found only for a missing slug', async () => {
    at('/area/no-such-area', <AreaPage />, '/area/:slug');
    expect(screen.queryByText('No page for this region')).toBeNull();
    await waitFor(() => expect(screen.getByText('No page for this region')).toBeTruthy(), { timeout: 25000 });
  }, 60000);
});

describe('AgencyPage "See all agencies"', () => {
  it('sits in the Nearby agencies heading row when there are nearby agencies, and once only', () => {
    const data = agencyPageData(TTC, [TTC, HSR], '2026-10-13T00:00:00Z', { slug: 'toronto', name: 'Toronto' });
    view(<AgencyPage data={data} />);
    const links = screen.getAllByRole('link', { name: 'See all agencies' });
    expect(links).toHaveLength(1);
    expect(links[0].parentElement).toBe(screen.getByRole('heading', { name: /Nearby agencies/ }).parentElement);
  });

  it('still has the link when there are no nearby agencies', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC], '2026-10-13T00:00:00Z')} />);
    expect(screen.queryByRole('heading', { name: /Nearby agencies/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'See all agencies' })).toHaveLength(1);
  });
});
