import { describe, it, expect } from 'vitest';
import { countryForRegion, countriesForAgencies } from '../regionCountry.js';

describe('countryForRegion', () => {
  it('maps Canadian provinces/territories to Canada', () => {
    expect(countryForRegion('Ontario')).toBe('Canada');
    expect(countryForRegion('Yukon')).toBe('Canada');
  });

  it('maps US states and DC to United States', () => {
    expect(countryForRegion('California')).toBe('United States');
    expect(countryForRegion('Washington DC')).toBe('United States');
  });

  it('maps known non-North-American regions to their country', () => {
    expect(countryForRegion('Jalisco')).toBe('Mexico');
    expect(countryForRegion('Grand Est')).toBe('France');
    expect(countryForRegion('Nouvelle-Aquitaine')).toBe('France');
    expect(countryForRegion('Pays de la Loire')).toBe('France');
    expect(countryForRegion('Wallonia')).toBe('Belgium');
    expect(countryForRegion('Basque Country')).toBe('Spain');
  });

  it('returns null for unmapped or missing regions', () => {
    expect(countryForRegion('Nowhere Land')).toBeNull();
    expect(countryForRegion(null)).toBeNull();
    expect(countryForRegion(undefined)).toBeNull();
  });
});

describe('countriesForAgencies', () => {
  it('returns distinct countries in stable display order', () => {
    const result = countriesForAgencies([
      { region: 'Grand Est' },
      { region: 'Ontario' },
      { region: 'California' },
      { region: 'Jalisco' },
    ]);
    expect(result).toEqual(['Canada', 'United States', 'Mexico', 'France']);
  });

  it('only includes countries actually present in the given list (respects visibility filtering upstream)', () => {
    const result = countriesForAgencies([{ region: 'Ontario' }, { region: 'California' }]);
    expect(result).toEqual(['Canada', 'United States']);
  });

  it('ignores agencies with unmapped or missing regions', () => {
    const result = countriesForAgencies([{ region: 'Ontario' }, { region: undefined }, { region: 'Nowhere' }]);
    expect(result).toEqual(['Canada']);
  });
});
