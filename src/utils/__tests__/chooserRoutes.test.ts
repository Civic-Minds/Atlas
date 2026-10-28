import { describe, expect, it } from 'vitest';
import { chooserRouteRow } from '../chooserRoutes';
import { buildRouteKey } from '../routeKey';

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
