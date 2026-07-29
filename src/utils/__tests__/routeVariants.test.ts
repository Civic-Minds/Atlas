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
});
