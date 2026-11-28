import { describe, expect, it } from 'vitest';
import { FREE_CHILD_AGE_COUNTS, FREE_CHILD_AGENCIES_BY_COUNTRY, FREE_CHILD_REGIONS, freeChildFareStats } from '../freeChildFares';
import { REGION_TILES } from '../regionTileGrid';

// CIV-3184: the ledger these counts come from moved to the private Atlas-Editorial repo
// (research/free-child-fares-2026-10-11/free-child-fare-ledger.csv), so the check against each ledger row lives with it.
// What stays here is what the chart itself must keep true.
describe('free child fares chart counts (CIV-1149)', () => {
  it('keeps the heading true: age 5 is the most common cutoff', () => {
    const [topAge] = [...FREE_CHILD_AGE_COUNTS].sort((a, b) => b[1] - a[1])[0];
    expect(topAge).toBe(5);
    expect(freeChildFareStats).toMatchObject({ agencies: 565, freeUpToAge: 375, notFound: 42 });
  });

  it('adds up: the countries and the states and provinces each count every agency once', () => {
    const byCountry = Object.values(FREE_CHILD_AGENCIES_BY_COUNTRY).reduce((a, b) => a + b, 0);
    expect(byCountry).toBe(freeChildFareStats.agencies);
    expect(FREE_CHILD_REGIONS.reduce((a, [, agencies]) => a + agencies, 0)).toBe(freeChildFareStats.agencies);
  });

  it('gives every state and province one tile of its own (CIV-1282)', () => {
    const cells = FREE_CHILD_REGIONS.map(([name]) => REGION_TILES[name]);
    expect(cells.every(Boolean)).toBe(true);
    expect(new Set(cells.map(c => `${c.col},${c.row}`)).size).toBe(cells.length);
    expect(new Set(cells.map(c => c.abbr)).size).toBe(cells.length);
  });
});
