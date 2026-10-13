import { describe, expect, it } from 'vitest';
import { normalizeRouteFilterFeatures } from '../../../shared/routeHeadwayFilter';
import { routeListDisplay, routeListDisplayHeadway, routeListHeadwayText, routeListSharedHeadway } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import fixtures from './fixtures/shared-stretch-range.json';

// Rows from published artifacts (per-stop headway fields trimmed; sharedStops and stopOrder kept).
function rows(key: keyof typeof fixtures): ShapeProperties[] {
  const features = (fixtures[key] as unknown[]).map(p => ({ properties: structuredClone(p) as unknown as Record<string, unknown> }));
  normalizeRouteFilterFeatures(features);
  return features.map(f => f.properties as unknown as ShapeProperties);
}

describe('route lists show a range where alternating branches share a stretch', () => {
  it('GO Lakeshore West weekday midday: every 30 on the shared part, 60 per branch', () => {
    const lw = rows('goLakeshoreWest');
    expect(routeListDisplay(lw, 'midday')).toEqual({ headway: 60, limited: false, sharedHeadway: 30 });
    expect(routeListHeadwayText(60, 30)).toBe('about every 30–60 min');
    // No pooled PM value on the shared stretch: the single number stays.
    expect(routeListDisplay(lw, 'pmPeak')).toEqual({ headway: 60, limited: false });
    // Limited stays limited, never a range.
    expect(routeListDisplay(lw, 'amPeak')).toEqual({ headway: null, limited: true });
  });

  it('Expo Line Saturday: every 3 on the trunk, 6 on each branch', () => {
    const expo = rows('expoSaturday');
    expect(routeListDisplayHeadway(expo, 'midday')).toBe(6);
    expect(routeListSharedHeadway(expo, 'midday')).toBe(3);
  });

  it('a short shared stretch never makes a range (Miami 37)', () => {
    const m37 = rows('miami37');
    expect(routeListDisplay(m37, 'midday')).toEqual({ headway: 30, limited: false });
  });

  it('the single number reads as before without a range', () => {
    expect(routeListHeadwayText(12)).toBe('every 12 min');
    expect(routeListHeadwayText(12, 12)).toBe('every 12 min');
  });
});
