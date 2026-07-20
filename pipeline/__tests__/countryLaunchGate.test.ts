import { describe, expect, it } from 'vitest';
import {
  COUNTRY_LAUNCH_FLAG,
  CountryLaunchBlockedError,
  assertCountryMayWriteToR2,
  countryFromCenter,
  countryHasLiveAgencies,
  isAgencyLiveInProduction,
  isCountryLaunchBlocked,
  resolveAgencyCountry,
} from '../countryLaunchGate.js';

const registry = [
  { slug: 'ttc', region: 'Ontario', center: [43.65, -79.38] as [number, number] },
  { slug: 'sfmta', region: 'California', center: [37.77, -122.42] as [number, number] },
  { slug: 'metz', region: 'Grand Est', center: [49.12, 6.18] as [number, number], hiddenInProduction: true },
  { slug: 'rennes', region: 'Bretagne', center: [48.11, -1.68] as [number, number], hiddenInProduction: true },
  { slug: 'guadalajara', region: 'Jalisco', center: [20.64, -103.36] as [number, number], hiddenInProduction: true },
];

describe('isAgencyLiveInProduction', () => {
  it('treats plain agencies as live', () => {
    expect(isAgencyLiveInProduction({})).toBe(true);
  });

  it('excludes hiddenInProduction and staged', () => {
    expect(isAgencyLiveInProduction({ hiddenInProduction: true })).toBe(false);
    expect(isAgencyLiveInProduction({ staged: true })).toBe(false);
  });
});

describe('countryHasLiveAgencies', () => {
  it('is true for Canada/US from the fixture registry', () => {
    expect(countryHasLiveAgencies('Canada', registry)).toBe(true);
    expect(countryHasLiveAgencies('United States', registry)).toBe(true);
  });

  it('is false when a country only has hidden agencies (France, Mexico today)', () => {
    expect(countryHasLiveAgencies('France', registry)).toBe(false);
    expect(countryHasLiveAgencies('Mexico', registry)).toBe(false);
  });

  it('becomes true once any agency in that country is un-hidden', () => {
    const launched = [
      ...registry,
      { slug: 'bordeaux', region: 'Nouvelle-Aquitaine', hiddenInProduction: false },
    ];
    expect(countryHasLiveAgencies('France', launched)).toBe(true);
  });
});

describe('countryFromCenter', () => {
  it('maps known international centers', () => {
    expect(countryFromCenter([49.12, 6.18])).toBe('France'); // Metz
    expect(countryFromCenter([50.85, 4.35])).toBe('Belgium'); // Brussels
    expect(countryFromCenter([43.26, -2.93])).toBe('Spain'); // Bilbao
    expect(countryFromCenter([20.64, -103.36])).toBe('Mexico'); // Guadalajara
  });

  it('returns null for US/Canada centers (not in fallback boxes)', () => {
    expect(countryFromCenter([43.65, -79.38])).toBeNull(); // Toronto
    expect(countryFromCenter([37.77, -122.42])).toBeNull(); // SF
  });
});

describe('resolveAgencyCountry', () => {
  it('prefers region mapping over center', () => {
    expect(resolveAgencyCountry({ region: 'Grand Est', center: [49.12, 6.18] })).toBe('France');
    expect(resolveAgencyCountry({ region: 'Ontario', center: [43.65, -79.38] })).toBe('Canada');
  });

  it('falls back to center when region is missing (new candidate before config)', () => {
    expect(resolveAgencyCountry({ region: null, center: [48.11, -1.68] })).toBe('France');
  });
});

describe('assertCountryMayWriteToR2', () => {
  it('allows writes for already-live countries', () => {
    expect(() =>
      assertCountryMayWriteToR2({
        country: 'Canada',
        agencies: registry,
        forceLaunch: false,
        slug: 'ttc',
        action: 'process',
      }),
    ).not.toThrow();
  });

  it('blocks France/Mexico without the override flag', () => {
    expect(() =>
      assertCountryMayWriteToR2({
        country: 'France',
        agencies: registry,
        forceLaunch: false,
        slug: 'rennes',
        action: 'process',
      }),
    ).toThrow(CountryLaunchBlockedError);

    expect(() =>
      assertCountryMayWriteToR2({
        country: 'Mexico',
        agencies: registry,
        forceLaunch: false,
        slug: 'guadalajara',
        action: 'process',
      }),
    ).toThrow(/zero production-visible/);
  });

  it('allows the write when --i-am-launching-country was passed', () => {
    expect(() =>
      assertCountryMayWriteToR2({
        country: 'France',
        agencies: registry,
        forceLaunch: true,
        slug: 'rennes',
        action: 'process',
      }),
    ).not.toThrow();
  });

  it('no-ops when country cannot be resolved (fail-open for unmapped US regions)', () => {
    expect(() =>
      assertCountryMayWriteToR2({
        country: null,
        agencies: registry,
        forceLaunch: false,
        slug: 'mystery',
        action: 'process',
      }),
    ).not.toThrow();
  });

  it('error message names the override flag', () => {
    try {
      assertCountryMayWriteToR2({
        country: 'France',
        agencies: registry,
        forceLaunch: false,
        slug: 'metz',
        action: 'R2 process upload',
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CountryLaunchBlockedError);
      expect((e as Error).message).toContain(COUNTRY_LAUNCH_FLAG);
      expect((e as Error).message).toContain('metz');
      expect((e as Error).message).toContain('France');
    }
  });
});

describe('isCountryLaunchBlocked', () => {
  const prevBucket = process.env.R2_BUCKET_NAME;

  afterEach(() => {
    if (prevBucket === undefined) delete process.env.R2_BUCKET_NAME;
    else process.env.R2_BUCKET_NAME = prevBucket;
  });

  it('matches assert semantics without throwing on production bucket', () => {
    process.env.R2_BUCKET_NAME = 'atlas';
    expect(isCountryLaunchBlocked('France', registry)).toBe(true);
    expect(isCountryLaunchBlocked('Canada', registry)).toBe(false);
    expect(isCountryLaunchBlocked(null, registry)).toBe(false);
  });

  it('does not block writes to staging (non-production) bucket', () => {
    process.env.R2_BUCKET_NAME = 'atlas-staging';
    expect(isCountryLaunchBlocked('France', registry)).toBe(false);
    expect(() =>
      assertCountryMayWriteToR2({
        country: 'France',
        agencies: registry,
        forceLaunch: false,
        slug: 'lyon',
        action: 'staging process',
      }),
    ).not.toThrow();
  });
});
