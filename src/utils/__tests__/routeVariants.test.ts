import { describe, expect, it } from 'vitest';
import { findVariantFamily } from '../routeVariants';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

function feature(routeId: string, routeShortName: string, headway: number): ShapeProperties {
  return { routeId, routeShortName, headway } as ShapeProperties;
}

describe('findVariantFamily', () => {
  it('groups lettered variants of the same numeric base (GRTC-style)', () => {
    const features = [
      feature('1', '1', 10),
      feature('2', '1A', 15),
      feature('3', '1B', 20),
    ];
    const family = findVariantFamily(features, '1', 'midday', 'grtc');
    expect(family?.base).toBe('1');
    expect(family?.members.map(m => m.shortName).sort()).toEqual(['1', '1A', '1B']);
  });

  it('does not group excluded agency/base pairs even when names match the pattern (#294)', () => {
    const features = [
      feature('16', '1A', 20),
      feature('17', '1C', 10),
    ];
    const family = findVariantFamily(features, '1C', 'midday', 'windsor');
    expect(family).toBeNull();
  });

  it('still groups the same base for a different agency (exclusion is agency-scoped)', () => {
    const features = [
      feature('16', '1A', 20),
      feature('17', '1C', 10),
    ];
    const family = findVariantFamily(features, '1C', 'midday', 'other-agency');
    expect(family?.base).toBe('1');
  });

  // #303 sweep: confirmed via each agency's own GTFS route_long_name (route_id "1" is
  // "Kaimuki-Kalihi", route_id "1L" is "Hawaii Kai-Aloha Stadium Limited" -- unrelated
  // destinations, not a trunk+branch pair).
  it('does not group TheBus (Honolulu) 1/1L (#303)', () => {
    const features = [
      feature('1', '1', 20),
      feature('1L', '1L', 10),
    ];
    expect(findVariantFamily(features, '1', 'midday', 'thebus')).toBeNull();
  });

  // #303 sweep: GoRaleigh route_id "11" is "Avent Ferry", "11L" is "Buck Jones Connector".
  it('does not group GoRaleigh 11/11L (#303)', () => {
    const features = [
      feature('11', '11', 20),
      feature('11L', '11L', 10),
    ];
    expect(findVariantFamily(features, '11', 'midday', 'goraleigh')).toBeNull();
  });

  // #335/#336: 7A and 7B are clockwise/counterclockwise around the same loop (confirmed
  // against the agency's GTFS -- only 2 shared stops total, both at the terminal turning
  // loop), not corridor branches. Combining their headways produced a bogus "~8 min" figure
  // no rider ever experiences, since a single stop is only ever served by one of the two.
  it('does not group Halifax Transit 7A/7B (#335, #336)', () => {
    const features = [
      feature('7A', '7A', 15),
      feature('7B', '7B', 15),
    ];
    expect(findVariantFamily(features, '7A', 'midday', 'halifax')).toBeNull();
  });
});
