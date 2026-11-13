import { describe, expect, it } from 'vitest';
import { normalizeRouteFilterFeatures } from '../../../shared/routeHeadwayFilter';
import { routeListDisplay, routeListDisplayHeadway, routeListHeadwayText } from '../effectiveHeadway';
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
    expect(routeListHeadwayText(60, 30)).toBe('every 30–60 min');
    expect(routeListHeadwayText(60, 30, true)).toBe('30–60 min');
    // CIV-1447: the list reads the card's own numbers, 30 toward Union and 60 and 71 on the branches (the map's number is 64).
    expect(routeListDisplay(lw, 'pmPeak')).toEqual({ headway: 71, limited: false, sharedHeadway: 30 });
    // Limited stays limited, never a range.
    expect(routeListDisplay(lw, 'amPeak')).toEqual({ headway: null, limited: true, noRegular: true });
  });

  it('Expo Line Saturday: every 3 on the trunk, 6 on each branch', () => {
    const expo = rows('expoSaturday');
    // The map's number is 12 (the branches); the card keeps 3 on the trunk and 6 per branch. The list shows no range: the range
    // rule needs a low end of at least 5 (CIV-1227, as the cards and History).
    expect(routeListDisplayHeadway(expo, 'midday')).toBe(12);
    expect(routeListDisplay(expo, 'midday').sharedHeadway).toBeUndefined();
  });

  it('a list reads the card\'s Shared stretch row too (Miami 37: the card\'s Shared stretch every 15 and rows 29 to 31, CIV-1447)', () => {
    const m37 = rows('miami37');
    expect(routeListDisplay(m37, 'midday')).toEqual({ headway: 31, limited: false, sharedHeadway: 15 });
  });

  it('the single number reads as before without a range', () => {
    expect(routeListHeadwayText(12)).toBe('every 12 min');
    expect(routeListHeadwayText(12, 12)).toBe('every 12 min');
  });
});
