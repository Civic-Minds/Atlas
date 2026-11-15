import { describe, expect, it } from 'vitest';
import { routeListDisplay, routeListHeadwayText, routeListLowEnd } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import ttc102json from './fixtures/ttc-102-weekday.json';
import brampton1json from './fixtures/brampton-1-weekday.json';
import ttc63json from './fixtures/ttc-63-weekday.json';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel, reportRowValueText } from '../routeCardRows';

// TTC 102 Markham Rd, weekday (properties only).
const ttc102 = (ttc102json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

// #1231: a list range starts at the lowest number the route card shows.
describe('route list range from the card', () => {
  it('starts at the card\'s lowest row, not a stretch the card does not show (TTC 102 midday: 20 and 30, was 5–30)', () => {
    expect(routeListDisplay(ttc102, 'midday')).toMatchObject({ headway: 30, sharedHeadway: 20 });
  });
  it('starts at the card\'s Shared stretch row where it has one (TTC 102 PM: every 7)', () => {
    expect(routeListLowEnd(ttc102, 'pmPeak')).toBe(7);
  });
  it('shows the range only where the range rule does, as History does (CIV-1227: TTC 102 PM 7 against 30 reads every 30)', () => {
    const pm = routeListDisplay(ttc102, 'pmPeak');
    expect(pm).toMatchObject({ headway: 30 });
    expect(pm.sharedHeadway).toBeUndefined();
    expect(routeListHeadwayText(30, 7)).toBe('every 30 min');
    expect(routeListHeadwayText(30, 20)).toBe('every 20–30 min');
  });
  it('shows no number or range where every pattern is span (#1247: the filter reads no service there)', () => {
    const limited = ttc102.map(d => ({ ...d, tier: 'span' }) as ShapeProperties);
    expect(routeListDisplay(limited, 'midday')).toMatchObject({ headway: null, noRegular: true });
    expect(routeListDisplay(limited, 'midday').sharedHeadway).toBeUndefined();
  });
});

// Brampton 1 Queen, weekday (public release, per-stop fields left out).
const brampton1 = (brampton1json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

// CIV-1447 (Ryan: "lists must match the card"): a list reads the card's lowest and highest numbers.
const ttc63 = (ttc63json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);
const cardTexts = (directions: ShapeProperties[], name: string) => {
  const route = { routeShortName: name, routeLongName: '', directions };
  const card = buildRouteCardModel({ ...route, directionGroups: buildDirectionGroups(route, 'amPeak'), agencyFeatures: undefined, period: 'amPeak', maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false });
  return card.groups.flatMap(g => g.rows.map(r => reportRowValueText(r))).sort();
};
describe('route list range from the card\'s own numbers', () => {
  it('TTC 63 weekday AM peak: the card reads every 5–16 and every 9, so the list reads every 5–16 (the filter\'s 9 stays on the map)', () => {
    expect(cardTexts(ttc63, '63')).toEqual(['every 5–16 min', 'every 9 min']);
    const list = routeListDisplay(ttc63, 'amPeak');
    expect(routeListHeadwayText(list.headway!, list.sharedHeadway)).toBe('every 5–16 min');
  });
  it('Brampton 1 weekday AM peak: the card reads every 13–23 and 13–25, so the list reads every 13–25', () => {
    const route = { routeShortName: '1', routeLongName: 'Queen', directions: brampton1 };
    const card = buildRouteCardModel({ ...route, directionGroups: buildDirectionGroups(route, 'amPeak'), agencyFeatures: undefined, period: 'amPeak', maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false });
    expect(card.groups.flatMap(g => g.rows.map(r => reportRowValueText(r))).sort()).toEqual(['every 13–23 min', 'every 13–25 min']);
    const list = routeListDisplay(brampton1, 'amPeak');
    expect(routeListHeadwayText(list.headway!, list.sharedHeadway)).toBe('every 13–25 min');
  });
});
