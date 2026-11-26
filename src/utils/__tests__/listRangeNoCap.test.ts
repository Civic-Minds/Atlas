import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { routeListCellText, routeListDisplay } from '../effectiveHeadway';
import { headwayEvery, headwayEveryRange, headwayRangeShown } from '../headwayText';
import { RANGE_MAX_RATIO } from '../../../shared/rules/frequency';
import { normalizeRouteFilterFeatures } from '../../../shared/routeHeadwayFilter';
import { routeFilterReading } from '../../../shared/routeHeadwayFilter';
import rtd31json from './fixtures/rtd-31-weekday.json';

const features = (rtd31json as unknown as GeoJSON.FeatureCollection).features;
normalizeRouteFilterFeatures(features as never);
const rtd31 = features.map(f => f.properties as unknown as ShapeProperties);

/**
 * CIV-2909 (#1786, Ryan 2026-11-26, "1": "No cap. A range shows when its slow line runs regularly enough to get its own number (3 or
 * more evenly spaced trips)"): a list range past RANGE_MAX_RATIO shows when its slow line has its own number; the grade stays on the
 * slower number. Card rows keep RANGE_MAX_RATIO.
 */
describe('list range with no cap where the slow line has its own number (CIV-2909)', () => {
  it('keeps the 4x rule for anything else', () => {
    expect(RANGE_MAX_RATIO).toBe(4);
    expect(headwayRangeShown(10, 41)).toBe(false);
    expect(headwayRangeShown(10, 41, Infinity)).toBe(true);
  });
  it('reads RTD 31 weekday PM peak as "every 10–60 min", the grade unchanged', () => {
    const display = routeListDisplay(rtd31, 'pmPeak');
    expect(routeListCellText(display)).toBe(headwayEveryRange(10, 60));
    expect(display.wideRange).toBe(true);
    expect(routeListCellText(display)).not.toBe(headwayEvery(10));
    expect(routeFilterReading(rtd31, 'pmPeak', undefined, false).wait).toBeGreaterThan(60);
  });
});
