import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
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
const HSR: AgencyPageSummary = { ...TTC, slug: 'hsr', name: 'Hamilton Street Railway', displayName: 'HSR (Hamilton)', routes: [r('A', 3, 10), r('B', 3, 25)], routeCount: 2, sat: true, sun: false };
const AREA: AreaConfig = {
  slug: 'toronto', name: 'Toronto', type: 'CMA', officialName: 'Toronto', country: 'Canada', cities: ['Toronto'], bbox: [43, -80, 44, -79], center: [43.5, -79.5],
  largeMetro: true, page: true, agencies: ['ttc', 'hsr'],
};

function view(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('AgencyPage', () => {
  const data = agencyPageData(TTC, [TTC, HSR], '2026-10-13T00:00:00Z', { slug: 'toronto', name: 'Toronto' });

  it('shows the short title, the area link, plain stats and the five period columns', () => {
    view(<AgencyPage data={data} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('TTC · Toronto');
    expect(screen.getByRole('link', { name: 'Greater Toronto and Hamilton Area →' }).getAttribute('href')).toBe('/area/toronto');
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
    fireEvent.focus(screen.getByRole('button', { name: /route every 16–20 min/ }));
    expect(screen.getByRole('tooltip').textContent).toMatch(/route every 16–20 min/);
    expect(screen.queryByText(/pick a standard/i)).toBeNull();
  });

  it('hides a stat it cannot compute instead of showing a blank', () => {
    const bare = { ...TTC, span: null, routes: [r('x', 3, null)], sat: undefined, sun: undefined };
    view(<AgencyPage data={agencyPageData(bare, [bare], null)} />);
    expect(screen.queryByText('typical wait, weekday midday')).toBeNull();
    expect(screen.queryByText(/weekday service/)).toBeNull();
  });
});

describe('AgencyPage connections and intro', () => {
  it('shows the intro sentence and a capped Connects with list with links', () => {
    const withConns = { ...TTC, stops: 7566, connections: [
      { slug: 'hsr', name: 'HSR', routes: ['1 King', '2 Barton', '3 Cannon', '4 Bay', '5 Delaware', '6 Aberdeen', '7 Locke', '8 York'] },
      { slug: 'nopage', name: 'Tiny Transit', routes: ['A'] },
    ] };
    const d = agencyPageData(withConns, [withConns, HSR], null);
    expect(d.intro).toBe('Toronto Transit Commission operates 5 routes in Toronto with 7,566 stops and connects with HSR and Tiny Transit.');
    view(<AgencyPage data={d} />);
    expect(screen.getByRole('heading', { name: 'Connects with' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'HSR' }).getAttribute('href')).toBe('/agency/hsr');
    expect(screen.queryByRole('link', { name: 'Tiny Transit' })).toBeNull();
    expect(screen.getByText(/and 2 more/)).toBeTruthy();
    expect(screen.getByText(d.intro)).toBeTruthy();
  });

  it('omits the section with no connections', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC, HSR], null)} />);
    expect(screen.queryByRole('heading', { name: 'Connects with' })).toBeNull();
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
    expect(headers).toEqual(['Agency', 'Subway', 'Bus']);
    expect(screen.getByRole('link', { name: 'TTC (Toronto)' }).getAttribute('href')).toBe('/agency/ttc');
    const ttcRow = screen.getByRole('link', { name: 'TTC (Toronto)' }).closest('tr')!;
    const hsrRow = screen.getByRole('link', { name: 'HSR (Hamilton)' }).closest('tr')!;
    expect(hsrRow.textContent).toContain('–'); // no subway routes
  });

  it('shows the band bar and no fixed threshold', () => {
    view(<AreaPage data={data} />);
    expect(screen.queryByText(/15 min or better/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /every 10 min or better/ }).length).toBeGreaterThan(0);
  });
});
