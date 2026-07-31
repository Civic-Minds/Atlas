import { describe, it, expect } from 'vitest';
import { flattenPeriodHeadwayProps, NO_PERIOD_SERVICE_TILE_VALUE } from '../pmtilesProps';

describe('flattenPeriodHeadwayProps', () => {
  it('flattens nested period headway maps to MVT-safe keys', () => {
    const props: Record<string, unknown> = {
      headway: 10,
      worstDirectionHeadwayByPeriod: { midday: 45 },
      minStopHeadwayByPeriod: { midday: 12 },
      headwayByPeriod: { midday: 20 },
    };
    flattenPeriodHeadwayProps(props);
    expect(props.wdph_midday).toBe(45);
    expect(props.msph_midday).toBe(12);
    expect(props.hph_midday).toBe(20);
    expect(props.worstDirectionHeadwayByPeriod).toEqual({ midday: 45 });
  });

  // MVT has no null type -- a flat property written as null is silently dropped by tippecanoe,
  // not preserved. A sentinel keeps the key present (and thus distinguishable from "no data
  // computed at all") while guaranteeing it never satisfies a real `<= maxHeadway` filter check.
  it('encodes explicit no-service periods as the MVT-safe sentinel, not null', () => {
    const props: Record<string, unknown> = {
      headway: 30,
      headwayByPeriod: { late: null },
    };
    flattenPeriodHeadwayProps(props);
    expect(Object.hasOwn(props, 'hph_late')).toBe(true);
    expect(props.hph_late).toBe(NO_PERIOD_SERVICE_TILE_VALUE);
  });

  it('does not write a flat key at all when the period was never computed', () => {
    const props: Record<string, unknown> = {
      headway: 30,
      headwayByPeriod: {},
    };
    flattenPeriodHeadwayProps(props);
    expect(Object.hasOwn(props, 'hph_late')).toBe(false);
  });
});
