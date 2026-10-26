import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReport, pointInGeometry, populationAreas, qualifyingRoutes } from '../src/coverage.mjs';
import { bufferedBounds, deriveServiceBundles, mergeCoverageReports } from '../src/bundles.mjs';

const square = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const props = (directionId, stopOrder) => ({ routeShortName: '1', directionId, day: 'Weekday', stopOrder, headwayByPeriod: { amPeak: 10, midday: 12, pmPeak: 15 }, headwayByPeriodSustained: { amPeak: true, midday: true, pmPeak: true }, headwayByHour: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 7), 15])) });

test('point-in-polygon and direction qualification', () => {
  assert.equal(pointInGeometry([0.5, 0.5], square(0, 0, 1, 1)), true);
  assert.equal(pointInGeometry([2, 2], square(0, 0, 1, 1)), false);
  assert.equal(qualifyingRoutes([{ properties: props(0, ['a']) }, { properties: { ...props(1, ['b']), headwayByPeriod: { amPeak: 20, midday: 12, pmPeak: 15 } } }]).length, 0);
  assert.equal(qualifyingRoutes([{ properties: props(0, ['a']) }, { properties: { ...props(1, ['b']), headwayByPeriod: { amPeak: 20, midday: 12, pmPeak: 15 }, headwayByHour: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 7), 20])) } }], 30).length, 2);
});

test('population inputs ignore missing fields and accept US POP100', () => {
  const areas = populationAreas({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: square(0, 0, 1, 1), properties: { GEOID: '010010001001', POP100: 537 } }] });
  assert.equal(areas.length, 1);
  assert.equal(areas[0].population, 537);
  assert.equal(areas[0].id, '010010001001');
});

test('overlapping agencies are counted once', () => {
  const report = calculateReport({
    agencies: [{ slug: 'a', name: 'A', region: 'Ontario' }, { slug: 'b', name: 'B', region: 'Ontario' }],
    coverage: [
      { slug: 'a', name: 'A', routes: 1, qualifyingRoutes: 1, stops: [{ lat: 0, lon: 0 }] },
      { slug: 'b', name: 'B', routes: 1, qualifyingRoutes: 1, stops: [{ lat: 0, lon: 0 }] },
    ],
    population: [
      { id: 'one', population: 100, point: [0.005, 0.005], geometry: square(0, 0, 0.01, 0.01), properties: {} },
      { id: 'two', population: 50, point: [0.025, 0.025], geometry: square(0.02, 0.02, 0.03, 0.03), properties: {} },
    ],
    metroBoundaries: [{ id: '355', name: 'Test CMA', geometry: square(-0.01, -0.01, 0.03, 0.03) }],
    network: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [0.005, 0.005]] }, properties: {} }] },
  });
  assert.equal(report.scope.atlasCoveragePopulation, 150);
  assert.equal(report.scope.coveredPopulation, 100);
  assert.equal('canadianAgencyCount' in report.scope, false);
});

test('service bundles connect shared states and merge duplicate population areas', () => {
  const state = (id, name, w, s, e, n) => ({ id, name, geometry: square(w, s, e, n) });
  const states = [state('A', 'Alpha', 0, 0, 1, 1), state('B', 'Beta', 1, 0, 2, 1), state('C', 'Gamma', 10, 0, 11, 1)];
  const bundles = deriveServiceBundles({
    agencies: [],
    states,
    coverage: [
      { slug: 'cross-border', name: 'Cross Border', qualifyingRoutes: 2, stops: [{ lon: 0.5, lat: 0.5 }, { lon: 1.5, lat: 0.5 }] },
      { slug: 'gamma', name: 'Gamma Transit', qualifyingRoutes: 1, stops: [{ lon: 10.5, lat: 0.5 }] },
    ],
  });
  assert.deepEqual(bundles.map(bundle => bundle.states.map(state => state.id)), [['A', 'B'], ['C']]);
  assert.deepEqual(bufferedBounds([0, 0, 1, 1], 0), [0, 0, 1, 1]);
  const merged = mergeCoverageReports([
    { scope: {}, definition: {}, diagnostics: {}, areas: [{ id: 'one', population: 100, covered: false, cmaId: 'x', cmaName: 'X' }] },
    { scope: {}, definition: {}, diagnostics: {}, areas: [{ id: 'one', population: 100, covered: true, cmaId: 'x', cmaName: 'X' }, { id: 'two', population: 50, covered: false, cmaId: 'x', cmaName: 'X' }] },
  ]);
  assert.equal(merged.scope.coveredPopulation, 100);
  assert.equal(merged.diagnostics.duplicateAreaCount, 1);
  assert.equal(merged.scope.atlasCoveragePopulation, 150);
});
