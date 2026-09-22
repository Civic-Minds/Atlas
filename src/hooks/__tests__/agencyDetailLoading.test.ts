import { describe, expect, it } from 'vitest';
import { DETAIL_GEOJSON_MIN_ZOOM, shouldLoadAgencyDetails } from '../useAgencyData';

describe('agency detail loading zoom gate', () => {
  it('keeps detailed agency data for city-level views', () => {
    expect(shouldLoadAgencyDetails(DETAIL_GEOJSON_MIN_ZOOM, '')).toBe(true);
    expect(shouldLoadAgencyDetails(10, '')).toBe(true);
  });

  it('defers detailed agency data for regional and broad views', () => {
    expect(shouldLoadAgencyDetails(7.99, '')).toBe(false);
    expect(shouldLoadAgencyDetails(3.59, '')).toBe(false);
  });

  it('allows search to request detail at any zoom', () => {
    expect(shouldLoadAgencyDetails(3.59, 'ottawa')).toBe(true);
  });
});
