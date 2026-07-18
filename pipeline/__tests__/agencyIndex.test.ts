import { describe, it, expect } from 'vitest';
import { buildAgencyIndex } from '../agencyIndex.js';

describe('buildAgencyIndex', () => {
  it('maps the public-facing subset and sorts by slug', () => {
    const result = buildAgencyIndex([
      { slug: 'yrt', name: 'York Region Transit', center: [43.86, -79.44] },
      { slug: 'ttc', name: 'Toronto Transit Commission', center: [43.65, -79.38], region: 'Ontario' },
    ]);
    expect(result.agencies.map(a => a.slug)).toEqual(['ttc', 'yrt']);
    expect(result.agencyCount).toBe(2);
    expect(result.agencies[0]).toEqual({
      slug: 'ttc', name: 'Toronto Transit Commission', region: 'Ontario',
      center: [43.65, -79.38], bbox: null,
    });
  });

  it('excludes staged agencies (not yet live)', () => {
    const result = buildAgencyIndex([
      { slug: 'ttc', name: 'TTC', staged: true },
      { slug: 'yrt', name: 'YRT' },
    ]);
    expect(result.agencies.map(a => a.slug)).toEqual(['yrt']);
  });

  it('excludes agencies hidden from production (#222)', () => {
    const result = buildAgencyIndex([
      { slug: 'guadalajara', name: 'Mi Transporte', hiddenInProduction: true },
      { slug: 'yrt', name: 'YRT' },
    ]);
    expect(result.agencies.map(a => a.slug)).toEqual(['yrt']);
  });

  it('never leaks feedUrl/mdbFeedUrl or other pipeline-only fields', () => {
    const withExtras = { slug: 'ttc', name: 'TTC', feedUrl: 'http://internal', mdbFeedUrl: 'http://mirror' };
    const result = buildAgencyIndex([withExtras]);
    expect(Object.keys(result.agencies[0]).sort()).toEqual(['bbox', 'center', 'name', 'region', 'slug']);
  });

  it('defaults missing optional fields to null rather than omitting them', () => {
    const result = buildAgencyIndex([{ slug: 'x', name: 'X Transit' }]);
    expect(result.agencies[0]).toEqual({ slug: 'x', name: 'X Transit', region: null, center: null, bbox: null });
  });
});
