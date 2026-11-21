import { describe, expect, it } from 'vitest';
import { routeListResults } from '../searchResults';

// CIV-2001: Studio's search finds only its page's routes, ranked and labelled as the map's search does.
describe('routeListResults', () => {
  const routes = [
    { agencySlug: 'ttc', agencyName: 'TTC', route: '504', longName: 'King' },
    { agencySlug: 'ttc', agencyName: 'TTC', route: '501', longName: 'Queen' },
    { agencySlug: 'ttc', agencyName: 'TTC', route: '29', longName: 'Dufferin' },
  ];
  it('matches by number and name, best match first, and keys each result by agency and route', () => {
    expect(routeListResults(routes, '50').map(r => r.routeShortName)).toEqual(['501', '504']);
    expect(routeListResults(routes, 'king').map(r => r.key)).toEqual(['ttc::504']);
  });
  it('finds nothing for an empty query or a route the page does not have', () => {
    expect(routeListResults(routes, ' ')).toEqual([]);
    expect(routeListResults(routes, '999')).toEqual([]);
  });
});
