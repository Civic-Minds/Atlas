import { describe, expect, it } from 'vitest';
import { chooserRouteRow } from '../chooserRoutes';
import { buildRouteKey } from '../routeKey';
import { headwayToTierColor } from '../colors';

const line = (props: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: props });
const layers = {
  fxb: { type: 'FeatureCollection', features: [line({ routeId: '_Route 13_FXBGO!_FFF', routeShortName: '', routeLongName: 'Route 13', routeType: 3, agencyName: 'FXBGO!', tier: '30' })] },
  ttc: { type: 'FeatureCollection', features: [line({ routeId: '504', routeBranch: 'A', routeShortName: '504', routeLongName: 'King', routeType: 0, agencyName: 'TTC', tier: '10' })] },
} as any;
const agencies = [{ slug: 'fxb', name: 'FXBGO!' }, { slug: 'ttc', name: 'TTC' }] as any;

describe('route chooser rows (CIV-984)', () => {
  it('labels a route from its feature, not its key', () => {
    expect(chooserRouteRow('fxb::_Route 13_FXBGO!_FFF', layers, agencies, 'default').label.text).toBe('Route 13');
  });
  it('finds a branch key by the feature\'s own branch and keeps the key it was given', () => {
    const key = buildRouteKey('ttc', '504', 'A');
    const row = chooserRouteRow(key, layers, agencies, 'default');
    expect(row.label.text).toContain('504');
    expect(row.key).toBe(key);
  });
  it('with no loaded feature shows the route ID, never the whole key', () => {
    const row = chooserRouteRow(buildRouteKey('gone', '77', 'X'), layers, agencies, 'default');
    expect(row.label.text).toBe('77');
  });

});

// #1246: the dot is the line's colour, from the value the map draws it with, for the day and period on screen.
describe('route chooser dot colour (#1246)', () => {
  // LA Metro E Line, weekday: stored tier 30 (a stricter whole-day grade), drawn every 8 all day.
  const eLine = (day: string, value: number, midday: number | null) => line({
    routeId: '804', routeShortName: 'E Line', routeType: 0, agencyName: 'Metro', day, tier: '30',
    routeAllDayHeadway: value, routeFilterHeadwayByPeriod: { midday: midday }, headwayByPeriod: { midday: midday }, routeRunsByPeriod: { midday: midday != null },
  });
  const metro = { lacmta: { type: 'FeatureCollection', features: [eLine('Saturday', 14, 14), eLine('Weekday', 8, 10)] } } as any;
  const agencies = [{ slug: 'lacmta', name: 'Metro' }] as any;

  it('takes the line colour, not the stored tier, on the day shown', () => {
    expect(chooserRouteRow('lacmta::804', metro, agencies, 'default', 'Weekday', 'all').color).toBe(headwayToTierColor(8));
    expect(chooserRouteRow('lacmta::804', metro, agencies, 'default', 'Saturday', 'all').color).toBe(headwayToTierColor(14));
  });

  it('follows the period on screen', () => {
    expect(chooserRouteRow('lacmta::804', metro, agencies, 'default', 'Weekday', 'midday').color).toBe(headwayToTierColor(10));
  });

  it('has no dot where the route has no service in the period, as the card shows no badge', () => {
    const none = { lacmta: { type: 'FeatureCollection', features: [eLine('Weekday', 8, null)] } } as any;
    expect(chooserRouteRow('lacmta::804', none, agencies, 'default', 'Weekday', 'midday').color).toBeUndefined();
  });

  it('is grey where the route runs in the period with no value, as the map line and the card\'s "limited" dot are', () => {
    const runsNoValue = line({ routeId: '804', routeShortName: 'E Line', routeType: 0, day: 'Weekday', tier: '30', routeFilterHeadwayByPeriod: { midday: null }, routeRunsByPeriod: { midday: true }, headwayByPeriod: { midday: 40 } });
    const fc = { lacmta: { type: 'FeatureCollection', features: [runsNoValue] } } as any;
    expect(chooserRouteRow('lacmta::804', fc, agencies, 'default', 'Weekday', 'midday').color).toBe(headwayToTierColor(null));
  });

  it('has no dot on a day the route has no feature, never another day\'s value', () => {
    const saturdayOnly = { lacmta: { type: 'FeatureCollection', features: [eLine('Saturday', 14, 14)] } } as any;
    expect(chooserRouteRow('lacmta::804', saturdayOnly, agencies, 'default', 'Weekday', 'all').color).toBeUndefined();
  });
});
