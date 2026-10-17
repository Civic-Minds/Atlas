import { describe, expect, it } from 'vitest';
import { routeCardPeriodShapeText } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const row = (edge: ShapeProperties['stretchPeriodEdge'], gap?: ShapeProperties['stretchPeriodGap']) => ({ stretchPeriodEdge: edge, stretchPeriodGap: gap }) as ShapeProperties;

describe('routeCardPeriodShapeText (#934, D6)', () => {
  it('a late start reads from the first departure', () => {
    expect(routeCardPeriodShapeText(row({ amPeak: { from: 437, every: 9 } }), 'amPeak')).toBe('from 7:17am, every 9 min');
  });
  it('an early end reads until the last departure', () => {
    expect(routeCardPeriodShapeText(row({ pmPeak: { until: 1060, every: 10 } }), 'pmPeak')).toBe('until 5:40pm, every 10 min');
  });
  it('one gap inside steady service reads the median and the gap', () => {
    expect(routeCardPeriodShapeText(row(undefined, { overnight: { every: 5, gap: 169 } }), 'overnight')).toBe('every 5 min, with a 169 min gap');
  });
  it('nothing for other periods, all day, or a feature without the field', () => {
    expect(routeCardPeriodShapeText(row({ amPeak: { from: 437, every: 9 } }), 'midday')).toBeUndefined();
    expect(routeCardPeriodShapeText(row({ amPeak: { from: 437, every: 9 } }), 'all')).toBeUndefined();
    expect(routeCardPeriodShapeText(row(undefined), 'amPeak')).toBeUndefined();
  });
});
