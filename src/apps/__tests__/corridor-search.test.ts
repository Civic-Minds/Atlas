import { describe, it, expect } from 'vitest';
import {
  buildStopCatalog,
  normalizeStopName,
  rankStopMatch,
  resolveAutoSelect,
  searchStops,
} from '../corridor-search';

describe('normalizeStopName', () => {
  it('strips platform suffixes', () => {
    expect(normalizeStopName('Hamilton GO Centre Platform 18')).toBe('Hamilton GO Centre');
  });
});

describe('searchStops', () => {
  const catalog = buildStopCatalog(
    {
      go: {
        a: { name: 'Square One', lat: 43.59, lon: -79.64 },
        b: { name: 'Hamilton GO', lat: 43.25, lon: -79.87 },
      },
      miway: {
        c: {
          name: 'City Centre Dr At Square One Parking Lot 1',
          lat: 43.59,
          lon: -79.64,
        },
        d: { name: 'Living Arts Dr At Square One Dr', lat: 43.59, lon: -79.64 },
      },
    },
    [
      { slug: 'go', name: 'GO Transit' },
      { slug: 'miway', name: 'MiWay' },
    ],
  );

  it('ranks exact and short names above street addresses', () => {
    const results = searchStops(catalog, 'Square One');
    expect(results[0]?.displayName).toBe('Square One');
    expect(results.length).toBeGreaterThan(1);
  });

  it('finds Hamilton GO', () => {
    const results = searchStops(catalog, 'hamilton go');
    expect(results[0]?.displayName).toBe('Hamilton GO');
  });
});

describe('rankStopMatch', () => {
  it('prefers exact over substring', () => {
    expect(rankStopMatch('Square One', 'Square One')).toBeGreaterThan(
      rankStopMatch('City Centre Dr At Square One Dr', 'Square One'),
    );
  });
});

describe('resolveAutoSelect', () => {
  const stop = {
    stopId: '1',
    name: 'Square One',
    displayName: 'Square One',
    lat: 0,
    lon: 0,
    agencySlug: 'go',
    agencyName: 'GO',
  };

  it('selects on exact match among many', () => {
    const others = [
      stop,
      { ...stop, stopId: '2', displayName: 'City Centre Dr At Square One Dr', name: 'City Centre Dr At Square One Dr' },
    ];
    expect(resolveAutoSelect(others, 'Square One')).toEqual(stop);
  });

  it('selects when only one suggestion', () => {
    expect(resolveAutoSelect([stop], 'sq')).toEqual(stop);
  });

  it('returns null when ambiguous', () => {
    const a = { ...stop, stopId: 'a', displayName: 'King Station' };
    const b = { ...stop, stopId: 'b', displayName: 'King West' };
    expect(resolveAutoSelect([a, b], 'king')).toBeNull();
  });
});

describe('buildStopCatalog', () => {
  it('dedupes cross-agency identical normalized names', () => {
    const catalog = buildStopCatalog(
      {
        go: { x: { name: 'Hamilton GO Centre Bus', lat: 1, lon: 1 } },
        hsr: { y: { name: 'Hamilton GO Centre', lat: 1, lon: 1 } },
      },
      [
        { slug: 'go', name: 'GO' },
        { slug: 'hsr', name: 'HSR' },
      ],
    );
    expect(catalog).toHaveLength(1);
    expect(catalog[0].displayName).toBe('Hamilton GO Centre');
  });
});
