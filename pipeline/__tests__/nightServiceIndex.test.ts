import { describe, expect, it } from 'vitest';
import { buildNightServiceIndex, extractNightServiceRoutes, mergeNightServiceIndex } from '../nightServiceIndex';

describe('extractNightServiceRoutes', () => {
  it('keeps only routes flagged nightService, dropping the rest', () => {
    const features = [
      { properties: { nightService: true, routeShortName: '300', directionId: 0, headsign: 'Downtown', day: 'Saturday' } },
      { properties: { nightService: false, routeShortName: '1', directionId: 0, headsign: 'Main St', day: 'Saturday' } },
      { properties: { routeShortName: '2', directionId: 1, headsign: null, day: 'Saturday' } },
    ];
    const result = extractNightServiceRoutes('ttc', 'Toronto Transit Commission', 'Ontario', features);
    expect(result).toEqual([
      {
        agencySlug: 'ttc',
        agencyName: 'Toronto Transit Commission',
        region: 'Ontario',
        routeShortName: '300',
        routeLongName: null,
        routeColor: null,
        directionId: 0,
        headsign: 'Downtown',
        day: 'Saturday',
      },
    ]);
  });

  it('returns an empty array when no route qualifies', () => {
    const features = [{ properties: { nightService: false, routeShortName: '1' } }];
    expect(extractNightServiceRoutes('ttc', 'Toronto Transit Commission', null, features)).toEqual([]);
  });
});

describe('buildNightServiceIndex', () => {
  it('sorts by agency slug then route short name (numeric-aware) and dedupes agency count', () => {
    const index = buildNightServiceIndex([
      { agencySlug: 'ttc', agencyName: 'TTC', region: null, routeShortName: '300', routeLongName: null, routeColor: null, directionId: 0, headsign: null, day: 'Saturday' },
      { agencySlug: 'ttc', agencyName: 'TTC', region: null, routeShortName: '52', routeLongName: null, routeColor: null, directionId: 1, headsign: null, day: 'Saturday' },
      { agencySlug: 'brampton', agencyName: 'Brampton Transit', region: null, routeShortName: '1', routeLongName: null, routeColor: null, directionId: 0, headsign: null, day: 'Saturday' },
    ]);
    expect(index.agencyCount).toBe(2);
    expect(index.routeCount).toBe(3);
    expect(index.routes.map(r => `${r.agencySlug}:${r.routeShortName}`)).toEqual([
      'brampton:1',
      'ttc:52',
      'ttc:300',
    ]);
  });

  it('reports zero agencies and routes for an empty input', () => {
    const index = buildNightServiceIndex([]);
    expect(index.agencyCount).toBe(0);
    expect(index.routeCount).toBe(0);
    expect(index.routes).toEqual([]);
  });
});

describe('mergeNightServiceIndex', () => {
  it('retains skipped agencies and replaces agencies processed in the current run', () => {
    const existing = buildNightServiceIndex([
      { agencySlug: 'ttc', agencyName: 'TTC', region: 'Ontario', routeShortName: '300', routeLongName: null, routeColor: null, directionId: 0, headsign: null, day: 'Saturday' },
      { agencySlug: 'wmata', agencyName: 'WMATA', region: 'Washington DC', routeShortName: 'C11', routeLongName: null, routeColor: null, directionId: 0, headsign: null, day: 'Saturday' },
    ]);
    const refreshed = [
      { agencySlug: 'wmata', agencyName: 'WMATA', region: 'Washington DC', routeShortName: 'C13', routeLongName: null, routeColor: null, directionId: 0, headsign: null, day: 'Saturday' },
    ];

    const result = mergeNightServiceIndex(existing, refreshed, new Set(['wmata']));

    expect(result.routes.map(r => `${r.agencySlug}:${r.routeShortName}`)).toEqual([
      'ttc:300',
      'wmata:C13',
    ]);
  });

  it('removes old entries when a refreshed agency no longer qualifies', () => {
    const existing = buildNightServiceIndex([
      { agencySlug: 'ttc', agencyName: 'TTC', region: 'Ontario', routeShortName: '300', routeLongName: null, routeColor: null, directionId: 0, headsign: null, day: 'Saturday' },
    ]);

    const result = mergeNightServiceIndex(existing, [], new Set(['ttc']));

    expect(result.routes).toEqual([]);
  });
});
