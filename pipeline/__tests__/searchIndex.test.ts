import { describe, expect, it } from 'vitest';
import { buildSearchRoutes, buildSearchStops, planSearchIndex, uploadSearchIndex, type SearchAgencyInput } from '../searchIndex';
import { indexedWords, queryStopKey, type SearchIndexFile, type SearchPageFile } from '../../shared/searchIndex';

const line = (props: Record<string, unknown>, coords: Array<[number, number]>) => ({
  properties: props,
  geometry: { type: 'LineString', coordinates: coords },
});

const muni: SearchAgencyInput = {
  slug: 'muni',
  routes: {
    features: [
      line({ routeId: '38', routeShortName: '38', routeLongName: 'Geary', routeType: 3, directionId: 0 }, [[-122.5, 37.78], [-122.4, 37.79]]),
      line({ routeId: '38', routeShortName: '38', routeLongName: 'Geary', routeType: 3, directionId: 1 }, [[-122.4, 37.79], [-122.5, 37.78]]),
      line({ routeId: '38R', routeShortName: '38R', routeLongName: 'Geary Rapid', routeType: 3 }, [[-122.5, 37.78], [-122.4, 37.79]]),
      { properties: { stopId: 's1', routeId: '38' }, geometry: { type: 'Point', coordinates: [-122.45, 37.78] } },
    ],
  },
  stops: {
    a: { name: 'Geary Blvd & Park Presidio', lat: 37.78, lon: -122.47 },
    b: { name: 'Geary Blvd & Park Presidio', lat: 37.7801, lon: -122.4701 },
    c: { name: 'Geary Blvd & Park Presidio', lat: 37.9, lon: -122.47 },
    d: { name: 'Église Saint-Pierre', lat: 37.7, lon: -122.4 },
  },
};

const ttc: SearchAgencyInput = {
  slug: 'ttc',
  routes: { features: [line({ routeId: '504', routeShortName: '504', routeLongName: 'King', routeType: 0 }, [[-79.4, 43.64], [-79.35, 43.65]])] },
  stops: { k: { name: 'King St West at Bathurst St', lat: 43.644, lon: -79.402 } },
};

describe('search index routes (CIV-1048)', () => {
  it('keeps one row per route name, at the centre of its extent, and skips stops', () => {
    const file = buildSearchRoutes([ttc, muni]);
    expect(file.agencies).toEqual(['muni', 'ttc']);
    expect(file.routes).toEqual([
      [0, '38', '38', 'Geary', 3, 37.785, -122.45],
      [0, '38R', '38R', 'Geary Rapid', 3, 37.785, -122.45],
      [1, '504', '504', 'King', 0, 43.645, -79.375],
    ]);
  });
});

describe('search index stops (CIV-1048)', () => {
  it('files each stop name under its uncommon words, one point per place', () => {
    const splits = buildSearchStops([muni, ttc]);
    expect([...splits.keys()].sort()).toEqual(['bat', 'egl', 'gea', 'kin', 'par', 'pie', 'pre', 'sai']);
    // Two copies 10 m apart share a point; the one 13 km away keeps its own.
    expect(splits.get('gea')).toEqual({ muni: [['Geary Blvd & Park Presidio', 'a', 37.78, -122.47, 'c', 37.9, -122.47]] });
    expect(splits.get('egl')).toEqual({ muni: [['Église Saint-Pierre', 'd', 37.7, -122.4]] });
  });

  it('divides a split that is too large by the next character', () => {
    const many: SearchAgencyInput = {
      slug: 'big',
      routes: { features: [] },
      stops: Object.fromEntries(['Park', 'Parkdale', 'Parkside Plaza', 'Parker'].map((name, i) => [String(i), { name, lat: i, lon: i }])),
    };
    const splits = buildSearchStops([many], 60);
    expect([...splits.keys()].sort()).toEqual(['park_', 'parkd', 'parke', 'parks', 'pla']);
    expect(splits.get('park_')).toEqual({ big: [['Park', '0', 0, 0]] });
  });

  it('reads the smallest split among the query words', () => {
    const sizes: Record<string, number> = { kin: 50, bat: 10, park_: 200, parkd: 5 };
    const sizeOf = (k: string) => sizes[k];
    expect(queryStopKey('King St West at Bathurst', sizeOf)).toBe('bat');
    expect(queryStopKey('king', sizeOf)).toBe('kin');
    expect(queryStopKey('park', sizeOf)).toBe('park_');
    expect(queryStopKey('parkda', sizeOf)).toBe('parkd');
    // "par" alone was divided and names no split; "st" is too short.
    expect(queryStopKey('par', sizeOf)).toBeNull();
    expect(queryStopKey('st', sizeOf)).toBeNull();
    expect(indexedWords('Union Station')).toEqual(['union']);
  });
});

describe('search index upload (CIV-1048)', () => {
  it('uploads only the release files when nothing changed', async () => {
    const bucket = new Map<string, string>();
    const io = {
      listKeys: async (prefix: string) => [...bucket.keys()].filter(k => k.startsWith(prefix)),
      put: async (key: string, body: string) => { bucket.set(key, body); },
      runWithConcurrency: async <T>(tasks: Array<() => Promise<T>>) => { for (const t of tasks) await t(); },
    };
    const first = planSearchIndex([muni, ttc], 'atlas/releases/release-a');
    expect(await uploadSearchIndex(first.files, io)).toEqual({ uploaded: first.files.length, skipped: 0 });
    const second = planSearchIndex([muni, ttc], 'atlas/releases/release-b');
    expect(await uploadSearchIndex(second.files, io)).toEqual({ uploaded: 2, skipped: second.files.length - 2 });

    // The index names pages and splits that are in the bucket.
    const index = JSON.parse(bucket.get('atlas/releases/release-b/search/index.json')!) as SearchIndexFile;
    const page = JSON.parse(bucket.get(`atlas/search/pages/${index.pages.g}.json`)!) as SearchPageFile;
    expect(JSON.parse(bucket.get(`atlas/search/stops/${page.gea[0]}.json`)!)).toHaveProperty('muni');
    expect(bucket.has('atlas/releases/release-b/search/routes.json')).toBe(true);
  });
});
