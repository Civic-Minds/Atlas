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

  // #448: the exclusion list stays the authority even when geometry alone would say "real
  // trunk" -- Windsor's live data has 14+ shared stops in the correct order (a genuine shared
  // downtown corridor), yet 1A and 1C are still confirmed-separate routes. If the geometry
  // check ever won over this list, this test would start failing.
  it('exclusion list still wins even with real, well-ordered shared-stop data (#448)', () => {
    const trunk = ['t1', 't2', 't3', 't4'];
    const features = [
      { ...feature('16', '1A', 20), directionId: 0, stopOrder: ['a', ...trunk, 'b'] },
      { ...feature('17', '1C', 10), directionId: 0, stopOrder: ['x', ...trunk, 'y'] },
    ] as ShapeProperties[];
    expect(findVariantFamily(features, '1C', 'midday', 'windsor')).toBeNull();
  });

  it('geometry check gates a lettered pair not on the exclusion list (#448)', () => {
    const features = [
      { ...feature('20', '2', 20), directionId: 0, stopOrder: ['p', 'q'] },
      { ...feature('21', '2A', 10), directionId: 0, stopOrder: ['r', 's'] },
    ] as ShapeProperties[];
    expect(findVariantFamily(features, '2A', 'midday', 'some-other-agency')).toBeNull();
  });

  it('folds a real branch family that shares a trunk in the correct order (#448)', () => {
    const trunk = ['t1', 't2', 't3'];
    const features = [
      { ...feature('1', '1', 10), directionId: 0, stopOrder: ['a', ...trunk, 'd1'] },
      { ...feature('2', '1A', 15), directionId: 0, stopOrder: ['b', ...trunk, 'd2'] },
      { ...feature('3', '1B', 20), directionId: 0, stopOrder: ['c', ...trunk, 'd3'] },
    ] as ShapeProperties[];
    const family = findVariantFamily(features, '1', 'midday', 'grtc');
    expect(family?.members.map(m => m.shortName).sort()).toEqual(['1', '1A', '1B']);
  });

  // GRTC's real route 1/1A/1B/1C shape (confirmed against GRTC's own published route map):
  // base "1" is a separate northbound corridor (Chamberlayne) that only touches the same
  // downtown terminal; 1A/1B/1C share a real "Core Route" trunk south of downtown. Comparing
  // every member against the alphabetically-first one blocked the whole family; the fix has to
  // drop only the disconnected member and keep folding the rest.
  it('drops a disconnected outlier and folds the rest, instead of blocking the whole family (#448)', () => {
    const trunk = ['t1', 't2', 't3'];
    const features = [
      { ...feature('1', '1', 10), directionId: 0, stopOrder: ['north1', 'north2', 'north3'] },
      { ...feature('2', '1A', 15), directionId: 0, stopOrder: ['a', ...trunk, 'd1'] },
      { ...feature('3', '1B', 20), directionId: 0, stopOrder: ['b', ...trunk, 'd2'] },
      { ...feature('4', '1C', 12), directionId: 0, stopOrder: ['c', ...trunk, 'd3'] },
    ] as ShapeProperties[];
    const family = findVariantFamily(features, '1', 'midday', 'grtc');
    expect(family?.members.map(m => m.shortName).sort()).toEqual(['1A', '1B', '1C']);
  });

  // Two equally-sized candidate groups that don't connect to each other -- no single answer for
  // which one is "the real family," so don't guess.
  it('returns null when the largest connected group is ambiguous (a tie)', () => {
    const trunkOne = ['o1', 'o2', 'o3'];
    const trunkTwo = ['t1', 't2', 't3'];
    const features = [
      { ...feature('1', '1', 10), directionId: 0, stopOrder: ['a', ...trunkOne, 'd1'] },
      { ...feature('2', '1A', 15), directionId: 0, stopOrder: ['b', ...trunkOne, 'd2'] },
      { ...feature('3', '1B', 20), directionId: 0, stopOrder: ['c', ...trunkTwo, 'd3'] },
      { ...feature('4', '1C', 12), directionId: 0, stopOrder: ['d', ...trunkTwo, 'd4'] },
    ] as ShapeProperties[];
    expect(findVariantFamily(features, '1', 'midday', 'some-other-agency')).toBeNull();
  });
});
