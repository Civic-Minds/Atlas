import { describe, it, expect } from 'vitest';
import {
  filterRouteResultsForDisplay,
  isRoutePrimaryQuery,
  isStrongAgencyQuery,
  prefersAgencySearchResults,
  prepareRouteResultsForDisplay,
  routeQueryMatchRank,
  routesBeforeAgencies,
  searchRouteResults,
  splitByViewport,
} from '../searchResults';
import type { AgencySearchGroup } from '../agencySearch';

describe('searchResults', () => {
  it('detects route-primary queries', () => {
    expect(isRoutePrimaryQuery('501')).toBe(true);
    expect(isRoutePrimaryQuery('6x')).toBe(true);
    expect(isRoutePrimaryQuery('ttc')).toBe(false);
    expect(isRoutePrimaryQuery('toronto')).toBe(false);
    expect(isRoutePrimaryQuery('express')).toBe(false);
  });

  it('treats exact agency slug queries as agency-primary', () => {
    const agencies: AgencySearchGroup[] = [{
      key: 'TTC::Ontario',
      name: 'Toronto Transit Commission',
      region: 'Ontario',
      slug: 'ttc',
      inView: true,
      distanceM: 0,
    }];
    const slugOnlyRoutes = Array.from({ length: 20 }, (_, i) => ({
      key: `ttc::${i}`,
      routeShortName: String(i + 1),
      routeLongName: null,
      inView: true,
      distanceM: 0,
      matchRank: 7,
    }));

    expect(isStrongAgencyQuery('ttc', agencies)).toBe(true);
    expect(prefersAgencySearchResults('ttc', slugOnlyRoutes, agencies)).toBe(true);
    expect(routesBeforeAgencies('ttc', slugOnlyRoutes, agencies)).toBe(false);
    expect(filterRouteResultsForDisplay('ttc', slugOnlyRoutes, agencies)).toEqual([]);
    const prepared = prepareRouteResultsForDisplay('express', slugOnlyRoutes, []);
    expect(prepared.totalMatches).toBe(20);
    expect(prepared.routes).toHaveLength(20);
    expect(prepared.truncated).toBe(false);
  });

  it('caps long route lists for display', () => {
    const manyRoutes = Array.from({ length: 50 }, (_, i) => ({
      key: `a::${i}`,
      routeShortName: String(i + 1),
      routeLongName: null,
      inView: true,
      distanceM: i,
      matchRank: 4,
    }));
    const prepared = prepareRouteResultsForDisplay('1', manyRoutes, []);
    expect(prepared.totalMatches).toBe(50);
    expect(prepared.routes).toHaveLength(30);
    expect(prepared.truncated).toBe(true);
  });

  it('ranks exact route number above substring', () => {
    const exact = { routeId: '501', routeShortName: '501', routeLongName: 'Queen' };
    const partial = { routeId: '5010', routeShortName: '5010', routeLongName: 'Other' };
    expect(routeQueryMatchRank(exact, '501')).toBeLessThan(routeQueryMatchRank(partial, '501'));
  });

  it('sorts in-viewport routes before elsewhere', () => {
    const features = [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[-80, 43], [-79.9, 43.1]] },
        properties: { routeId: '1', routeShortName: 'MAX', routeLongName: 'Max', agencySlug: 'far', agencyName: 'Far' },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[-79.4, 43.65], [-79.3, 43.7]] },
        properties: { routeId: '2', routeShortName: '6X', routeLongName: 'Six', agencySlug: 'ttc', agencyName: 'TTC' },
      },
    ];
    const bounds = { s: 43.5, w: -79.6, n: 43.9, e: -79.1 };
    const results = searchRouteResults(features, 'x', bounds);
    expect(results[0]?.routeShortName).toBe('6X');
    expect(results[0]?.inView).toBe(true);
  });

  it('puts routes first for numeric queries', () => {
    const routes = [{ key: 'a::1', routeShortName: '501', routeLongName: null, inView: true, distanceM: 0, matchRank: 0 }];
    const agencies = [{ key: 'TTC', name: 'TTC', region: 'Ontario', slug: 'ttc', inView: true, distanceM: 0 }];
    expect(routesBeforeAgencies('501', routes, agencies)).toBe(true);
  });

  it('splits in-view and elsewhere groups', () => {
    const items = [
      { id: 'a', inView: true },
      { id: 'b', inView: false },
    ];
    expect(splitByViewport(items)).toEqual({
      inView: [{ id: 'a', inView: true }],
      elsewhere: [{ id: 'b', inView: false }],
    });
  });
});
