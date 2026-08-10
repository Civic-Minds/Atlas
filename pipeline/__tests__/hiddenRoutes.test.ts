import { describe, expect, it } from 'vitest';
import { buildHiddenRoutesForAgency, mergeHiddenRoutes } from '../hiddenRoutes';

describe('hidden route inventory', () => {
  it('lists every route with hidden service, across all days', () => {
    const routes = buildHiddenRoutesForAgency(
      { slug: 'demo', name: 'Demo Transit', region: 'Ontario' },
      { features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '10', routeLongName: 'Main', tier: 'span', day: 'Sunday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '10', routeLongName: 'Main', tier: 'span', day: 'Weekday', routeHasIrregularDirection: true } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '30', routeLongName: 'Partial', tier: 'span', day: 'Sunday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '30', routeLongName: 'Partial', tier: '15', day: 'Sunday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '40', routeLongName: 'Some days', tier: 'span', day: 'Sunday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '40', routeLongName: 'Some days', tier: '15', day: 'Weekday' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeShortName: '20', routeLongName: 'Regular', tier: '15', day: 'Sunday' } },
      ] },
    );
    expect(routes).toEqual([expect.objectContaining({
      key: 'demo::10::Main',
      days: ['Sunday', 'Weekday'],
      reason: 'All service is hidden because it is irregular.',
    })]);
    expect(routes.some(route => route.routeShortName === '30')).toBe(false);
    expect(routes.some(route => route.routeShortName === '40')).toBe(false);
  });

  it('replaces only the agency that was refreshed', () => {
    const existing = mergeHiddenRoutes(null, [{ agencySlug: 'a', routes: [{ key: 'a::1::', agencySlug: 'a', agencyName: 'A', region: 'Ontario', routeShortName: '1', routeLongName: null, reason: 'old', days: ['Sunday'] }] }]);
    const updated = mergeHiddenRoutes(existing, [{ agencySlug: 'b', routes: [] }]);
    expect(updated.routes.map(route => route.key)).toEqual(['a::1::']);
  });
});
