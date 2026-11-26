import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { variantRowValue } from '../routeCardRowValue';

// RTD 31 Saturday PM "to Evans" (release-mwvbser2): the direction's filter value 114 is the full-period wait of the far-north
// piece that stops at 5:06 PM; the direction itself runs steadily every 15.
const evans = {
  stretchRole: 'variant',
  directionFilterHeadwayByPeriod: { pmPeak: 114, midday: 67 },
  stretchPeriodHeadway: { pmPeak: 15, midday: 15 },
  stretchPeriodSustained: { pmPeak: true, midday: true },
  stretchPeriodOneGap: { pmPeak: false, midday: false },
  stretchPeriodEdge: { pmPeak: { until: 1026, every: 61, stretch: 1 } },
} as unknown as ShapeProperties;

describe('variantRowValue (#1850, settled rule #1268)', () => {
  it('drops a full-period wait set by an edge, so the row reads its own spacing (RTD 31 to Evans, 114 -> own trips)', () => {
    expect(variantRowValue(evans, 'pmPeak')).toBeUndefined();
  });

  it('keeps the direction value where no edge sets it (midday 67 has no edge)', () => {
    expect(variantRowValue(evans, 'midday')).toBe(67);
  });

  it('keeps a value within the hour, and any value on a stretch that is not steady', () => {
    expect(variantRowValue({ ...evans, directionFilterHeadwayByPeriod: { pmPeak: 45 } } as ShapeProperties, 'pmPeak')).toBe(45);
    expect(variantRowValue({ ...evans, stretchPeriodSustained: { pmPeak: false } } as ShapeProperties, 'pmPeak')).toBe(114);
  });

  it('leaves non-variant rows and all day alone', () => {
    expect(variantRowValue({ ...evans, stretchRole: 'main' } as ShapeProperties, 'pmPeak')).toBeUndefined();
    expect(variantRowValue(evans, 'all')).toBeUndefined();
  });
});
