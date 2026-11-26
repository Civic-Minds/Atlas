import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { routeListCellText, routeListDisplay, routeListFilterDisplay } from '../effectiveHeadway';
import oc6json from './fixtures/octranspo-6-weekday.json';
import mbta65json from './fixtures/mbta-65-weekday.json';

// OC Transpo 6 Rockcliffe, weekday (public release, per-stop fields left out).
const oc6Features = (oc6json as unknown as GeoJSON.FeatureCollection).features;
const oc6 = oc6Features.map(f => f.properties as unknown as ShapeProperties);

// CIV-1300 (#1311, Ryan "1"): lists and agency pages read the route card's own words, never a worst wait as "every N".
describe('route lists read the card\'s words for an unsteady period', () => {
  it('OC Transpo 6 weekday midday: the card reads "every 15 min, with one 32 min gap", and so does the list (was "every 32")', () => {
    expect(routeListFilterDisplay(oc6, 'midday').headway).toBe(32);
    const list = routeListDisplay(oc6, 'midday');
    expect(list).toMatchObject({ headway: 15, colorHeadway: 32, edgeText: 'every 15 min, with one 32 min gap' });
    expect(routeListCellText(list, true)).toBe('every 15 min, with one 32 min gap');
  });
});


// #1684: MBTA 65 weekday (local main run pinned to 2026-11-19, per-stop fields left out).
const mbta65 = (mbta65json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

describe('a list range reads the number of a row whose words name a time (#1684)', () => {
  it('MBTA 65 weekday AM peak: the Brighton Center row reads "every 16 min from 6:39 AM", so the list is "every 8–16 min" (was 8–14)', () => {
    expect(routeListCellText(routeListDisplay(mbta65, 'amPeak'))).toBe('every 8–16 min');
  });
});

// CIV-2228 (#1771, Ryan "1", option B): when a period's service changes partway ("every 4 min until 9:17 AM, then every
// 6 min"), the list's number alone is the slower one. Published release release-mwurc2jb, per-stop fields left out.
import stm1json from './fixtures/stm-1-weekday.json';
import cta53json from './fixtures/cta-53-saturday.json';
const rowsOf = (fc: unknown) => (fc as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

describe('a change partway through a period reads the slower number (#1771)', () => {
  it('STM 1 weekday midday reads "every 6 min" (was "every 4"; every 4 only until 9:17 AM)', () => {
    expect(routeListCellText(routeListDisplay(rowsOf(stm1json), 'midday'))).toBe('every 6 min');
  });
  // #1825: with the branch readings always on, Ford City's row reads its own "every 18 min until 12:13 AM", so its number is 18, not 20.
  it('CTA 53 Saturday late reads "every 18–31 min" (was "every 7–20"; every 7 only until 11:33 PM, then every 31)', () => {
    expect(routeListCellText(routeListDisplay(rowsOf(cta53json), 'late'))).toBe('every 18–31 min');
  });
});
