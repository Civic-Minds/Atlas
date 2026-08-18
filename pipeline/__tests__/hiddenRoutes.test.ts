import { describe, expect, it } from 'vitest';
import { buildHiddenRoutesForAgency, mergeHiddenRoutes } from '../hiddenRoutes';

describe('hidden route inventory', () => {
  it('lists only routes whose service is entirely hidden', () => {
    const routes = buildHiddenRoutesForAgency(
      { slug: 'demo', name: 'Demo Transit', region: 'Ontario' },
      { features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '10', routeLongName: 'Main', tier: 'span', day: 'Sunday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '10', routeLongName: 'Main', tier: 'span', day: 'Weekday', routeHasIrregularDirection: true } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '30', routeLongName: 'Partial', tier: 'span', day: 'Sunday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '30', routeLongName: 'Partial', tier: '15', day: 'Sunday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '40', routeLongName: 'Some days', tier: 'span', day: 'Sunday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '40', routeLongName: 'Some days', tier: '15', day: 'Weekday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '50', routeLongName: 'Evening', tier: '60', serviceClass: 'time-limited', day: 'Weekday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '60', routeLongName: 'Exceptional', tier: '60', serviceClass: 'irregular', day: 'Weekday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '20', routeLongName: 'Regular', tier: '15', day: 'Sunday' } },
      ] },
    );
    expect(routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'demo::10::Main' }),
      expect.objectContaining({ key: 'demo::60::Exceptional' }),
    ]));
    expect(routes).toHaveLength(2);
    expect(routes.some(route => route.routeShortName === '30')).toBe(false);
    expect(routes.some(route => route.routeShortName === '40')).toBe(false);
    expect(routes.some(route => route.routeShortName === '50')).toBe(false);
    expect(routes).toEqual(expect.arrayContaining([expect.objectContaining({ routeShortName: '60' })]));
  });

  it('replaces only the agency that was refreshed', () => {
    const existing = mergeHiddenRoutes(null, [{ agencySlug: 'a', routes: [{ key: 'a::1::', agencySlug: 'a', agencyName: 'A', region: 'Ontario', routeShortName: '1', routeLongName: null }] }]);
    const updated = mergeHiddenRoutes(existing, [{ agencySlug: 'b', routes: [] }]);
    expect(updated.routes.map(route => route.key)).toEqual(['a::1::']);
  });
});
