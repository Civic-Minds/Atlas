import { describe, it, expect } from 'vitest';
import { flattenPeriodHeadwayProps } from '../pmtilesProps';

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

  it('preserves explicit no-service periods as null flat properties', () => {
    const props: Record<string, unknown> = {
      headway: 30,
      headwayByPeriod: { late: null },
    };
    flattenPeriodHeadwayProps(props);
    expect(Object.hasOwn(props, 'hph_late')).toBe(true);
    expect(props.hph_late).toBeNull();
  });
});
