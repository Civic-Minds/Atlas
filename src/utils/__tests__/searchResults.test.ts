import { describe, it, expect } from 'vitest';
import {
  filterRouteResultsForDisplay,
  isRoutePrimaryQuery,
  isStrongAgencyQuery,
  prefersAgencySearchResults,
  prepareRouteResultsForDisplay,
  resolveSearchEnterAction,
  routeQueryMatchRank,
  routesBeforeAgencies,
  searchRouteResults,
  searchStopResults,
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
    expect(prepared.routes).toHaveLength(10);
    expect(prepared.truncated).toBe(true);
  });

  it('prioritizes an agency whose primary city matches, over an incidental route/stop text match (#203)', () => {
    const agencies: AgencySearchGroup[] = [{
      key: 'LA Metro::California',
      name: 'Los Angeles County Metropolitan Transportation Authority (LA Metro)',
      region: 'California',
      slug: 'lacmta',
      inView: false,
      distanceM: 100,
      cities: ['Los Angeles, California', 'Koreatown, California'],
    }];
    // A route that only matches because its name happens to contain "Los Angeles" as text,
    // not because it's actually an LA-area route (e.g. Santa Clarita Transit route "799 Los Angeles").
    const incidentalRoute = [{
      key: 'santaclarita::799',
      routeShortName: '799',
      routeLongName: 'Los Angeles',
      inView: false,
      distanceM: 50,
      matchRank: 4,
    }];

    expect(prefersAgencySearchResults('los ang', incidentalRoute, agencies)).toBe(true);
    expect(routesBeforeAgencies('los ang', incidentalRoute, agencies)).toBe(false);

    // But a city name that only shows up further down an agency's served-cities list
    // (not its primary/first city) shouldn't trigger this — that's a weaker, incidental match.
    const notPrimaryCity: AgencySearchGroup[] = [{
      ...agencies[0],
      cities: ['Koreatown, California', 'Los Angeles, California'],
    }];
    expect(prefersAgencySearchResults('los ang', incidentalRoute, notPrimaryCity)).toBe(false);
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
    expect(prepared.routes).toHaveLength(10);
    expect(prepared.truncated).toBe(true);
  });

  it('ranks exact route number above substring', () => {
    const exact = { routeId: '501', routeShortName: '501', routeLongName: 'Queen', directionId: 0, tier: '5', headway: 5 };
    const partial = { routeId: '5010', routeShortName: '5010', routeLongName: 'Other', directionId: 0, tier: '5', headway: 5 };
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

  it('keeps same-shortName routes from different agencies separate, each with its own agency label (#211)', () => {
    const features = [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[-118.4, 34.0], [-118.3, 34.1]] },
        properties: {
          routeId: '7X', agencySlug: 'gtrans', agencyName: 'GTrans',
          routeShortName: '7X', routeLongName: 'Line 7x', headway: 6, directionId: 0,
        },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[-122.4, 37.7], [-122.3, 37.8]] },
        properties: {
          routeId: '7X', agencySlug: 'sfmta', agencyName: 'SFMTA',
          routeShortName: '7X', routeLongName: 'Noriega', headway: 8, directionId: 0,
        },
      },
    ];
    const results = searchRouteResults(features, '7x', null);
    expect(results).toHaveLength(2);
    const gtrans = results.find(r => r.key === 'gtrans::7X');
    const sfmta = results.find(r => r.key === 'sfmta::7X');
    expect(gtrans?.agencyName).toBe('GTrans');
    expect(sfmta?.agencyName).toBe('SFMTA');
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

  it('commits Enter only when one dropdown row is shown', () => {
    const agency: AgencySearchGroup = {
      key: 'Stratford::Ontario',
      name: 'Stratford Transit',
      region: 'Ontario',
      slug: 'stratford',
      inView: false,
      distanceM: 1000,
    };
    const route = {
      key: 'stratford::1',
      routeShortName: '1',
      routeLongName: 'Main',
      inView: false,
      distanceM: 1000,
      matchRank: 0,
    };
    expect(resolveSearchEnterAction([agency], [])).toEqual({ type: 'agency', slug: 'stratford' });
    expect(resolveSearchEnterAction([], [route])).toEqual({ type: 'route', key: 'stratford::1' });
    expect(resolveSearchEnterAction([agency], [route])).toBeNull();
  });

  it('consolidates and merges stop search results with the same hubId', () => {
    const features: any[] = [
      {
        type: 'Feature',
        properties: { stopId: 'pace1', stopName: 'Rosemont Cta Station', agencySlug: 'pace-bus', routeIds: ['811'], hubId: 'h_rosemont' },
        geometry: { type: 'Point', coordinates: [-87.85965, 42.00045] }
      },
      {
        type: 'Feature',
        properties: { stopId: 'cta1', stopName: 'Rosemont', agencySlug: 'cta', routeIds: ['Blue'], hubId: 'h_rosemont' },
        geometry: { type: 'Point', coordinates: [-87.85915, 41.99912] }
      }
    ];

    const routeNamesMap = new Map([
      ['pace-bus::811', '811'],
      ['cta::Blue', 'Blue']
    ]);

    const results = searchStopResults(features, 'rosemont', null, routeNamesMap);

    expect(results).toHaveLength(1);
    expect(results[0].stopName).toBe('Rosemont'); // "Rosemont" is shorter and matches "rosemont" query exactly (rank 2 vs rank 4)
    expect(results[0].routes).toEqual(['811', 'Blue']);
  });
});
