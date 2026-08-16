import { describe, expect, it } from 'vitest';
import { findPlaceByName } from '../placeLookup';

describe('findPlaceByName', () => {
  it('finds an exact (case-insensitive) city match', () => {
    expect(findPlaceByName('Denver')).toEqual({ name: 'Denver', region: 'Colorado', lat: 39.73915, lon: -104.9847 });
    expect(findPlaceByName('denver')).toEqual({ name: 'Denver', region: 'Colorado', lat: 39.73915, lon: -104.9847 });
  });

  it('does not fuzzy/substring match a similarly-spelled place', () => {
    expect(findPlaceByName('Bellevue')?.region).not.toBe('Ontario');
  });

  it('prefers the larger city when a name is ambiguous', () => {
    // Bellevue exists in both Washington (~140k) and Nebraska (~55k) — the bigger one wins.
    expect(findPlaceByName('Bellevue')).toEqual({ name: 'Bellevue', region: 'Washington', lat: 47.61038, lon: -122.20068 });
  });

  it('returns null for empty or unrecognized queries', () => {
    expect(findPlaceByName('')).toBeNull();
    expect(findPlaceByName('   ')).toBeNull();
    expect(findPlaceByName('not a real place xyz')).toBeNull();
  });
});
