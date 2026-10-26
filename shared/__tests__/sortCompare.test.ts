import { describe, expect, it } from 'vitest';
import {
  compareAgencyName,
  compareHeadwayThenNumber,
  compareNullableAscending,
  compareRegion,
  compareRouteNumber,
  compareSearchRelevance,
  type HeadwaySortable,
  type SearchRelevanceKeys,
} from '../sortCompare';

const byRoute = (names: string[]) => [...names].sort((a, b) => compareRouteNumber(a, b));

describe('compareRouteNumber', () => {
  it('sorts numbers naturally', () => {
    expect(byRoute(['10', '2', '1', '100', '20'])).toEqual(['1', '2', '10', '20', '100']);
  });

  it('puts 7A before 7B and both after 7, before 8', () => {
    expect(byRoute(['8', '7B', '7A', '7'])).toEqual(['7', '7A', '7B', '8']);
  });

  it('ignores case when comparing route numbers', () => {
    expect(compareRouteNumber('7a', '7A', 'Main', 'Bay')).toBeGreaterThan(0);
    expect(byRoute(['7b', '7A'])).toEqual(['7A', '7b']);
  });

  it('breaks equal numbers by long name', () => {
    expect(compareRouteNumber('5', '5', 'Yonge', 'Bathurst')).toBeGreaterThan(0);
    expect(compareRouteNumber('5', '5', null, 'Bathurst')).toBeLessThan(0);
  });

  it('gives case twins one fixed order regardless of input order', () => {
    expect(byRoute(['a1', 'A1'])).toEqual(byRoute(['A1', 'a1']));
    expect(compareRouteNumber('A1', 'a1')).not.toBe(0);
  });

  it('treats missing names as empty', () => {
    expect(compareRouteNumber(undefined, '1')).toBeLessThan(0);
    expect(compareRouteNumber(null, null)).toBe(0);
  });
});

describe('compareAgencyName', () => {
  it('sorts accents next to their plain letter', () => {
    const sorted = ['Zeta', 'Île-de-France Mobilités', 'Hamilton', 'Ile Transit', 'Jasper']
      .sort(compareAgencyName);
    expect(sorted).toEqual(['Hamilton', 'Ile Transit', 'Île-de-France Mobilités', 'Jasper', 'Zeta']);
  });

  it('ignores case', () => {
    expect(['stm', 'Société', 'STL'].sort(compareAgencyName)).toEqual(['Société', 'STL', 'stm']);
  });

  it('keeps accent twins in one fixed order', () => {
    expect(['Île', 'Ile'].sort(compareAgencyName)).toEqual(['Ile', 'Île'].sort(compareAgencyName));
    expect(compareAgencyName('Île', 'Ile')).not.toBe(0);
  });
});

describe('compareRegion', () => {
  it('sorts A-Z with Other last', () => {
    expect(['Quebec', 'Other', 'Alberta', 'Île-de-France', 'Ontario'].sort(compareRegion))
      .toEqual(['Alberta', 'Île-de-France', 'Ontario', 'Quebec', 'Other']);
  });

  it('keeps Other last even against late letters', () => {
    expect(['Other', 'Zürich'].sort(compareRegion)).toEqual(['Zürich', 'Other']);
    expect(compareRegion('Other', 'Other')).toBe(0);
  });
});

describe('compareNullableAscending', () => {
  it('puts null and undefined last', () => {
    expect([null, 10, undefined, 5].sort(compareNullableAscending)).toEqual([5, 10, null, undefined]);
  });

  it('treats Infinity as a value that ties with itself', () => {
    expect(compareNullableAscending(Infinity, Infinity)).toBe(0);
    expect(compareNullableAscending(5, Infinity)).toBeLessThan(0);
  });
});

describe('compareHeadwayThenNumber', () => {
  const row = (shortName: string, headway: number | null, longName = ''): HeadwaySortable => ({ shortName, headway, longName });

  it('sorts most frequent first with no-number routes last', () => {
    const sorted = [row('3', null), row('1', 15), row('2', 5)].sort(compareHeadwayThenNumber);
    expect(sorted.map(r => r.shortName)).toEqual(['2', '1', '3']);
  });

  it('breaks equal headways by route number so ties never shuffle', () => {
    const a = [row('10', 10), row('7B', 10), row('2', 10), row('7A', 10)];
    const b = [...a].reverse();
    expect(a.sort(compareHeadwayThenNumber).map(r => r.shortName)).toEqual(['2', '7A', '7B', '10']);
    expect(b.sort(compareHeadwayThenNumber).map(r => r.shortName)).toEqual(['2', '7A', '7B', '10']);
  });

  it('orders routes without a number by route number too', () => {
    const sorted = [row('9', null), row('4', null), row('1', 30)].sort(compareHeadwayThenNumber);
    expect(sorted.map(r => r.shortName)).toEqual(['1', '4', '9']);
  });

  it('keeps sentinel headways as numbers', () => {
    const sorted = [row('1', 999), row('2', 20)].sort(compareHeadwayThenNumber);
    expect(sorted.map(r => r.shortName)).toEqual(['2', '1']);
  });
});

describe('compareSearchRelevance', () => {
  type Row = SearchRelevanceKeys & { name: string };
  const byName = (a: Row, b: Row) => compareRouteNumber(a.name, b.name);
  const r = (name: string, inView: boolean, matchRank: number | undefined, distanceM: number): Row => ({ name, inView, matchRank, distanceM });

  it('orders in view, then match quality, then distance, then name', () => {
    const rows = [
      r('far-exact', false, 0, 10),
      r('view-prefix', true, 1, 5),
      r('view-exact-far', true, 0, 900),
      r('view-exact-near', true, 0, 100),
      r('10', true, 0, 100),
      r('2', true, 0, 100),
    ];
    const sorted = rows.sort((a, b) => compareSearchRelevance(a, b, byName)).map(x => x.name);
    expect(sorted).toEqual(['2', '10', 'view-exact-near', 'view-exact-far', 'view-prefix', 'far-exact']);
  });

  it('skips match quality when a list has none', () => {
    const rows = [r('B', false, undefined, 5), r('A', false, undefined, 5), r('C', false, undefined, 1)];
    expect(rows.sort((a, b) => compareSearchRelevance(a, b, byName)).map(x => x.name)).toEqual(['C', 'A', 'B']);
  });
});
