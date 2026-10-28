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
  searchIndexRouteResults,
  searchIndexStopResults,
  mergeRouteResults,
  mergeStopResults,
} from '../searchResults';
import type { AgencySearchGroup } from '../agencySearch';

// Labels are not under test here.
const NO_LABEL = { primary: '', secondary: undefined, text: '' };

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
      routeLongName: null, label: NO_LABEL,
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
      routeLongName: 'Los Angeles', label: NO_LABEL,
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
      routeLongName: null, label: NO_LABEL,
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
    const exact = { routeId: '501', routeShortName: '501', routeLongName: 'Queen', label: NO_LABEL, directionId: 0, tier: '5', headway: 5 };
    const partial = { routeId: '5010', routeShortName: '5010', routeLongName: 'Other', label: NO_LABEL, directionId: 0, tier: '5', headway: 5 };
    expect(routeQueryMatchRank(exact, '501')).toBeLessThan(routeQueryMatchRank(partial, '501'));
  });

  it('sorts in-viewport routes before elsewhere', () => {
    const features = [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[-80, 43], [-79.9, 43.1]] },
        properties: { routeId: '1', routeShortName: 'MAX', routeLongName: 'Max', label: NO_LABEL, agencySlug: 'far', agencyName: 'Far' },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[-79.4, 43.65], [-79.3, 43.7]] },
        properties: { routeId: '2', routeShortName: '6X', routeLongName: 'Six', label: NO_LABEL, agencySlug: 'ttc', agencyName: 'TTC' },
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
          routeShortName: '7X', routeLongName: 'Line 7x', label: NO_LABEL, headway: 6, directionId: 0,
        },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[-122.4, 37.7], [-122.3, 37.8]] },
        properties: {
          routeId: '7X', agencySlug: 'sfmta', agencyName: 'SFMTA',
          routeShortName: '7X', routeLongName: 'Noriega', label: NO_LABEL, headway: 8, directionId: 0,
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
    const routes = [{ key: 'a::1', routeShortName: '501', routeLongName: null, label: NO_LABEL, inView: true, distanceM: 0, matchRank: 0 }];
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
      routeLongName: 'Main', label: NO_LABEL,
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

describe('every-agency search index results (CIV-1048)', () => {
  // A view over downtown Toronto.
  const toronto = { s: 43.6, w: -79.5, n: 43.7, e: -79.3 };
  const names = new Map([['muni', 'Muni'], ['ttc', 'TTC'], ['actransit', 'AC Transit']]);
  const nameOf = (slug: string) => names.get(slug) ?? null;
  const routesFile = {
    v: 1,
    agencies: ['actransit', 'hidden', 'muni', 'ttc'],
    routes: [
      [0, '38', '38', 'Fruitvale', 3, 37.78, -122.22],
      [1, '38', '38', 'Hidden 38', 3, 40, -100],
      [2, '38', '38', 'Geary', 3, 37.78, -122.45],
      [3, '38', '38', 'Highland Creek', 3, 43.78, -79.2],
      [3, '504', '504', 'King', 0, 43.65, -79.38],
    ],
  } as const;

  it('finds "38 Geary" in an agency far from the view', () => {
    const results = searchIndexRouteResults(routesFile as never, '38 geary', toronto, nameOf);
    expect(results.map(r => r.key)).toEqual(['muni::38']);
    expect(results[0].inView).toBe(false);
    expect(results[0].agencyName).toBe('Muni');
  });

  it('ranks by match, then distance from the view, and skips agencies the app does not list', () => {
    const results = searchIndexRouteResults(routesFile as never, '38', toronto, nameOf);
    expect(results.map(r => r.key)).toEqual(['ttc::38', 'actransit::38', 'muni::38']);
  });

  it('does not list every route of an agency for its slug alone', () => {
    expect(searchIndexRouteResults(routesFile as never, 'ttc', toronto, nameOf)).toEqual([]);
  });

  it('reads stops with accents folded, one row per place', () => {
    const split = {
      muni: [['Geary Blvd & Park Presidio', 'a', 37.78, -122.47, 'c', 37.9, -122.47]],
      ttc: [['Église Saint-Pierre', 'e', 43.65, -79.4]],
    };
    // The copy 13 km further north is nearer Toronto.
    expect(searchIndexStopResults(split, 'geary', toronto, nameOf).map(s => s.key)).toEqual(['muni::c', 'muni::a']);
    const eglise = searchIndexStopResults(split, 'eglise', toronto, nameOf);
    expect(eglise.map(s => [s.key, s.inView])).toEqual([['ttc::e', true]]);
  });

  it('merges index results only for agencies not loaded', () => {
    const loaded = searchRouteResults([], '38', toronto);
    const fromIndex = searchIndexRouteResults(routesFile as never, '38', toronto, nameOf);
    expect(mergeRouteResults(loaded, fromIndex, new Set(['ttc']))!.map(r => r.key)).toEqual(['actransit::38', 'muni::38']);
    expect(mergeRouteResults(null, fromIndex, new Set())).toBeNull();
    expect(mergeStopResults([], [], new Set())).toEqual([]);
  });
});
