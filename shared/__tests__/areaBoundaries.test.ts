import { describe, expect, it } from 'vitest';
import { AREA_ROUTE_MIN_STOPS, areasForStops, inAreaBoundary, type AreaBoundaries } from '../areaBoundaries';
import { areaAgencySummaries } from '../areaPages';
import type { AgencyPageSummary } from '../agencyPages';

// A square "metro" with a hole (a lake), and a second area to its east.
const square = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const boundaries: AreaBoundaries = {
  metro: { bbox: [0, 0, 10, 10], polygons: [[square(0, 0, 10, 10), square(4, 4, 6, 6)]] },
  east: { bbox: [0, 20, 10, 30], polygons: [[square(20, 0, 30, 10)]] },
};

describe('area boundaries (CIV-274)', () => {
  it('is inside the outline and outside its holes', () => {
    expect(inAreaBoundary(2, 2, boundaries.metro)).toBe(true);
    expect(inAreaBoundary(5, 5, boundaries.metro)).toBe(false);
    expect(inAreaBoundary(15, 5, boundaries.metro)).toBe(false);
  });
  it(`counts a route in an area with ${AREA_ROUTE_MIN_STOPS}+ stops inside, not with a single terminal stop`, () => {
    // Fraser Valley 66 to Lougheed: two stops in the metro, the rest outside.
    expect(areasForStops([[1, 1], [2, 2], [15, 5], [25, 5], [26, 5]], boundaries)).toEqual(['east', 'metro']);
    // A ferry or coach terminal: one stop clips the edge.
    expect(areasForStops([[9, 9], [25, 5], [26, 5]], boundaries)).toEqual(['east']);
  });
});

describe('areaAgencySummaries counts routes where they run (CIV-274)', () => {
  const route = (name: string, areas?: string[]) => ({ name, longName: null, mode: 3, midday: 15, am: 15, pm: 15, evening: 30, overnight: null, ...(areas ? { areas } : {}) });
  const agency = (slug: string, routes: ReturnType<typeof route>[]) => ({ slug, name: slug, displayName: slug, city: '', routeCount: routes.length, routes, span: null, lastRefreshedAt: null }) as unknown as AgencyPageSummary;
  const all = new Map([
    ['home', agency('home', [route('1', ['metro']), route('2', ['east'])])],
    ['neighbour', agency('neighbour', [route('66', ['metro', 'east']), route('21', [])])],
    ['other', agency('other', [route('9', ['east'])])],
  ]);
  it('lists every agency with a route counted there, with only those routes', () => {
    const got = areaAgencySummaries({ slug: 'metro', agencies: ['home'] }, all);
    expect(got.map(a => [a.slug, a.routes.map(r => r.name), a.routeCount])).toEqual([['home', ['1'], 1], ['neighbour', ['66'], 1]]);
  });
  it('falls back to the area agency list for summaries without area tags', () => {
    const old = new Map([['home', agency('home', [route('1'), route('2')])]]);
    expect(areaAgencySummaries({ slug: 'metro', agencies: ['home'] }, old).map(a => a.routes.length)).toEqual([2]);
  });
});
