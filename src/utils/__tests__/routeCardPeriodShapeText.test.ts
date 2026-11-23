import { describe, expect, it } from 'vitest';
import { routeCardPeriodShapeText } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const row = (edge: ShapeProperties['stretchPeriodEdge'], gap?: ShapeProperties['stretchPeriodGap']) => ({ stretchPeriodEdge: edge, stretchPeriodGap: gap }) as ShapeProperties;

describe('routeCardPeriodShapeText (#934, D6)', () => {
  it('a late start reads from the first departure', () => {
    expect(routeCardPeriodShapeText(row({ amPeak: { from: 437, every: 9 } }), 'amPeak')).toBe('every 9 min from 7:17 AM');
  });
  it('an early end reads until the last departure', () => {
    expect(routeCardPeriodShapeText(row({ pmPeak: { until: 1060, every: 10 } }), 'pmPeak')).toBe('every 10 min until 5:40 PM');
  });
  it('a period that slows down names the slower part after the time (CIV-1913)', () => {
    expect(routeCardPeriodShapeText(row({ evening: { until: 1245, every: 15, then: 30 } }), 'evening')).toBe('every 15 min until 8:45 PM, then every 30 min');
  });
  it('one long wait in the slower part is named as a gap (#1724: Brampton 1 weekday evening)', () => {
    expect(routeCardPeriodShapeText(row({ evening: { until: 1182, every: 12, then: 25, thenGap: 37 } }), 'evening')).toBe('every 12 min until 7:42 PM, then every 25 min, with one 37 min gap');
  });
  it('an edge read on a named stretch goes only on a row that covers it (#1276)', () => {
    const edge = { pmPeak: { until: 1075, every: 30, stretch: 3 as const } };
    expect(routeCardPeriodShapeText({ ...row(edge), stretchCovers: ['main', 1, 3] } as ShapeProperties, 'pmPeak')).toBe('every 30 min until 5:55 PM');
    expect(routeCardPeriodShapeText({ ...row(edge), stretchCovers: ['main', 2] } as ShapeProperties, 'pmPeak')).toBeUndefined();
    expect(routeCardPeriodShapeText(row(edge), 'pmPeak')).toBeUndefined();
  });
  it('one gap inside steady service reads the median and the gap', () => {
    expect(routeCardPeriodShapeText(row(undefined, { overnight: { every: 5, gap: 169 } }), 'overnight')).toBe('every 5 min, with one 169 min gap');
  });
  it('nothing for other periods, all day, or a feature without the field', () => {
    expect(routeCardPeriodShapeText(row({ amPeak: { from: 437, every: 9 } }), 'midday')).toBeUndefined();
    expect(routeCardPeriodShapeText(row({ amPeak: { from: 437, every: 9 } }), 'all')).toBeUndefined();
    expect(routeCardPeriodShapeText(row(undefined), 'amPeak')).toBeUndefined();
  });
});
