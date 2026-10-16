import { describe, expect, it } from 'vitest';
import { routeCardEdgeText } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const row = (edge: ShapeProperties['stretchPeriodEdge']) => ({ stretchPeriodEdge: edge }) as ShapeProperties;

describe('routeCardEdgeText (#934)', () => {
  it('a late start reads from the first departure', () => {
    expect(routeCardEdgeText(row({ amPeak: { from: 437, every: 9 } }), 'amPeak')).toBe('from 7:17am, every 9 min');
  });
  it('an early end reads until the last departure', () => {
    expect(routeCardEdgeText(row({ pmPeak: { until: 1060, every: 10 } }), 'pmPeak')).toBe('until 5:40pm, every 10 min');
  });
  it('nothing for other periods, all day, or a feature without the field', () => {
    expect(routeCardEdgeText(row({ amPeak: { from: 437, every: 9 } }), 'midday')).toBeUndefined();
    expect(routeCardEdgeText(row({ amPeak: { from: 437, every: 9 } }), 'all')).toBeUndefined();
    expect(routeCardEdgeText(row(undefined), 'amPeak')).toBeUndefined();
  });
});
