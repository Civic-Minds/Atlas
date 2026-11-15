import { describe, expect, it } from 'vitest';
import { applyBranchReadCorrections, correctionsFor, type BranchReadCorrection } from '../branchReadCorrections';

// #1514 (Ryan, option 1): named route-periods take the branch-read value. The guard: a figure only ever gets
// longer, to a computed number, so a correction can never hide service or make it look better.
type F = { properties: { routeFilterHeadwayByPeriod?: Record<string, number | null>; directionFilterHeadwayByPeriod?: Record<string, number | null> }; slot: { group: string; dirId: string; day: string } };
const row = (group: string, dirId: string, day: string, route: Record<string, number | null>, dir: Record<string, number | null>): F =>
  ({ slot: { group, dirId, day }, properties: { routeFilterHeadwayByPeriod: { ...route }, directionFilterHeadwayByPeriod: { ...dir } } });
const providence: BranchReadCorrection = { routeShortName: 'id:CR-Providence', directionId: 1, day: 'Weekday', period: 'pmPeak', reason: 'test' };
const apply = (features: F[], honest: (key: string, period: string) => number | null | undefined, corrections = [providence]) =>
  applyBranchReadCorrections(features, corrections, f => f.slot, honest as never);

describe('branch-read corrections (#1514)', () => {
  it('names only its route, direction and day', () => {
    expect(correctionsFor([providence], 'id:CR-Providence::1::Weekday')).toHaveLength(1);
    expect(correctionsFor([providence], 'id:CR-Providence::0::Weekday')).toHaveLength(0);
    expect(correctionsFor([providence], 'id:CR-Providence::1::Saturday')).toHaveLength(0);
    expect(correctionsFor(undefined, 'x::1::Weekday')).toHaveLength(0);
  });

  it('raises the named period of the named direction and the route, and nothing else', () => {
    const inbound = row('id:CR-Providence', '1', 'Weekday', { pmPeak: 25, midday: 70 }, { pmPeak: 25, midday: 68 });
    const outbound = row('id:CR-Providence', '0', 'Weekday', { pmPeak: 25, midday: 70 }, { pmPeak: 22, midday: 70 });
    const other = row('id:CR-Worcester', '1', 'Weekday', { pmPeak: 47 }, { pmPeak: 47 });
    const changed = apply([inbound, outbound, other], (key, period) => (key === 'id:CR-Providence::1::Weekday' ? { pmPeak: 66, midday: 73 }[period] : 999));
    expect(changed).toEqual([{ key: 'id:CR-Providence::1::Weekday', period: 'pmPeak', before: 25, after: 66 }]);
    expect(inbound.properties.directionFilterHeadwayByPeriod).toEqual({ pmPeak: 66, midday: 68 });
    expect(inbound.properties.routeFilterHeadwayByPeriod).toEqual({ pmPeak: 66, midday: 70 });
    expect(outbound.properties.directionFilterHeadwayByPeriod).toEqual({ pmPeak: 22, midday: 70 });
    expect(outbound.properties.routeFilterHeadwayByPeriod).toEqual({ pmPeak: 66, midday: 70 });
    expect(other.properties).toEqual(row('id:CR-Worcester', '1', 'Weekday', { pmPeak: 47 }, { pmPeak: 47 }).properties);
  });

  it('guard: never shortens, never removes, never adds service', () => {
    const shorter = row('id:CR-Providence', '1', 'Weekday', { pmPeak: 25 }, { pmPeak: 25 });
    expect(apply([shorter], () => 12)).toEqual([]);
    expect(shorter.properties.directionFilterHeadwayByPeriod!.pmPeak).toBe(25);
    const none = row('id:CR-Providence', '1', 'Weekday', { pmPeak: 25 }, { pmPeak: 25 });
    expect(apply([none], () => null)).toEqual([]);
    expect(none.properties.routeFilterHeadwayByPeriod!.pmPeak).toBe(25);
    const noService = row('id:CR-Providence', '1', 'Weekday', { pmPeak: null }, { pmPeak: null });
    expect(apply([noService], () => 66)).toEqual([]);
    expect(noService.properties.directionFilterHeadwayByPeriod!.pmPeak).toBeNull();
  });
});
