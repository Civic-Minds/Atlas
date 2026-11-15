import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateReport, json, publicMapAgencies, ATLAS_FETCH_HEADERS, loadMapCode, pointInGeometry, populationAreas, qualifies, qualifyingRoutes, qualifyingRows } from '../src/coverage.mjs';
import { bufferedBounds, deriveServiceBundles, mergeCoverageReports } from '../src/bundles.mjs';

const { routeGroupKey } = await loadMapCode();
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

test('the frequency rule is a parameter: the study rule needs the sustained flag, no-sustained does not (CIV-1182)', () => {
  const unsustained = { ...props(0, ['a']), headwayByPeriodSustained: { amPeak: false, midday: true, pmPeak: true } };
  assert.equal(qualifies(unsustained, 15, 'study'), false);
  assert.equal(qualifies(unsustained, 15, 'no-sustained'), true);
  assert.equal(qualifies({ ...unsustained, headwayByPeriod: { amPeak: 20, midday: 12, pmPeak: 15 } }, 15, 'no-sustained'), false);
});

test('Atlas files are read with a named User-Agent, retried, and a refusal says who refused it (#1367)', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  const reply = (status, body, headers = {}) => new Response(body, { status, headers });
  try {
    let n = 0;
    globalThis.fetch = async (url, init) => { calls.push(init?.headers); return n++ === 0 ? reply(403, 'blocked') : reply(200, '{"stops":[]}'); };
    assert.deepEqual(await json('https://data.example/atlas/x-stops-meta.json', { delayMs: 0 }), { stops: [] });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]['User-Agent'], ATLAS_FETCH_HEADERS['User-Agent']);
    globalThis.fetch = async () => reply(403, '<html>Attention Required</html>', { server: 'cloudflare', 'cf-mitigated': 'challenge' });
    await assert.rejects(json('https://data.example/atlas/x.json', { delayMs: 0 }), /403 https:\/\/data\.example\/atlas\/x\.json \(cloudflare cf-mitigated=challenge\): <html>Attention Required/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// CIV-1179: real weekday rows (test/fixtures/civ1179-routes.json, cut from the published files on 2026-11-14).
const realRows = JSON.parse(readFileSync(new URL('./fixtures/civ1179-routes.json', import.meta.url), 'utf8')).agencies;
const routesAt = (slug, minutes, rule) => new Set(qualifyingRoutes(realRows[slug], minutes, rule).map(f => routeGroupKey(f.properties.routeShortName, f.properties.routeId)));

test('map-filter rule gives the map filter\'s own verdict in AM peak, midday and PM peak (CIV-1179)', () => {
  // Map filter values (AM/midday/PM): TTC 504 13/10/10, VTA Rapid 500 10/10/10, Windsor 1C 30/10/10,
  // DRT 900 24/24/24 (#1499), Regina 2 30/30/30, TriMet MAX Blue 30/15/15, Portland Aerial Tram 5/5/5.
  assert.ok(routesAt('ttc', 15, 'map-filter').has('504'));
  assert.ok(routesAt('vta', 15, 'map-filter').has('Rapid 500'));
  assert.equal(routesAt('windsor', 15, 'map-filter').has('1C'), false);
  assert.ok(routesAt('windsor', 30, 'map-filter').has('1C'));
  assert.equal(routesAt('drt', 15, 'map-filter').size, 0);
  assert.ok(routesAt('drt', 30, 'map-filter').has('900'));
  assert.equal(routesAt('regina', 15, 'map-filter').size, 0);
  assert.ok(routesAt('regina', 30, 'map-filter').has('2'));
  assert.deepEqual([...routesAt('trimet', 15, 'map-filter')], ['id:208']);
  assert.throws(() => qualifies(realRows.ttc[0].properties, 15, 'map-filter'), /whole routes/);
});

test('map-filter rule leaves the input rows untouched', () => {
  const before = JSON.stringify(realRows.windsor);
  qualifyingRoutes(realRows.windsor, 15, 'map-filter');
  assert.equal(JSON.stringify(realRows.windsor), before);
});

test('a row with no times ("Not in service") is not a gap (CIV-1179)', () => {
  const notInService = { ...props(1, ['z']), headsign: 'NotinService', headwayByPeriod: { amPeak: null, midday: null, pmPeak: null }, headwayByHour: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 7), null])) };
  assert.equal(qualifyingRoutes([{ properties: props(0, ['a']) }, { properties: props(1, ['b']) }, { properties: notInService }], 15, 'no-sustained').length, 2);
  // A row with times but a gap still fails the route.
  const gap = { ...props(1, ['c']), headwayByHour: { ...props(1, []).headwayByHour, 12: null } };
  assert.equal(qualifyingRoutes([{ properties: props(0, ['a']) }, { properties: gap }], 15, 'no-sustained').length, 0);
  // Real rows: Windsor 1C, VTA Rapid 500 and TTC 504 each have a no-times row that used to reject them.
  assert.ok(routesAt('windsor', 15, 'no-sustained').has('1C'));
  assert.ok(routesAt('vta', 15, 'no-sustained').has('Rapid 500'));
  assert.ok(routesAt('ttc', 15, 'no-sustained').has('504'));
});

test('routes with no short name are keyed by route_id, not merged (CIV-1179)', () => {
  const unnamed = (routeId, directionId, minutes) => ({ properties: { ...props(directionId, [routeId]), routeShortName: '', routeId, headwayByPeriod: { amPeak: minutes, midday: minutes, pmPeak: minutes }, headwayByHour: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 7), minutes])) } });
  const rows = [unnamed('MAX', 0, 10), unnamed('MAX', 1, 10), unnamed('WES', 0, 30), unnamed('WES', 1, 30)];
  assert.deepEqual(qualifyingRoutes(rows, 15, 'no-sustained').map(f => f.properties.routeId), ['MAX', 'MAX']);
  // TriMet: MAX Blue (route_id 100) and the Aerial Tram (208), both unnamed, stay separate routes.
  assert.deepEqual([...routesAt('trimet', 30, 'map-filter')].sort(), ['id:100', 'id:208']);
});

test('only agencies on the public map are counted (CIV-1179)', () => {
  const kept = publicMapAgencies([{ slug: 'a' }, { slug: 'b', hiddenInProduction: true }, { slug: 'c', betaOnly: true }, { slug: 'd', staged: true }]);
  assert.deepEqual(kept.map(agency => agency.slug), ['a']);
});

// CIV-1579: the trunk rule. DRT 900's rows (D1 value every 24) with the trunk value and stop mask the 2026-11-15
// release carries (trunk every 12/13/12); each fixture row keeps 3 stops, so the masks here are 3 long.
const trunkRows = (masks) => realRows.drt.filter(r => r.properties.routeShortName === '900').map((r, i) => ({
  ...r, properties: { ...r.properties, routeTrunkHeadwayByPeriod: { amPeak: 12, midday: 13, pmPeak: 12, evening: 15, late: null, overnight: null }, trunkStopMask: masks[i] },
}));
const countedStops = (features, minutes, rule) => {
  const { rows, stopsFor } = qualifyingRows(features, minutes, rule);
  return rows.flatMap(row => stopsFor(row).map(stop => `${row.properties.headsign}:${stop}`));
};

test('map-filter-trunk counts a route that passes on its trunk, at its trunk stops only (CIV-1579)', () => {
  const rows = trunkRows(['1*2,', '1*3', ',1*2']);
  assert.equal(qualifyingRoutes(rows, 15, 'map-filter').length, 0);
  const counted = countedStops(rows, 15, 'map-filter-trunk');
  const expected = rows.flatMap((row, i) => row.properties.stopOrder.filter((_, j) => [[1, 1, 0], [1, 1, 1], [0, 1, 1]][i][j]).map(stop => `${row.properties.headsign}:${stop}`));
  assert.deepEqual(counted.sort(), expected.sort());
  assert.equal(counted.length, 7);
  assert.deepEqual(qualifyingRows(rows, 15, 'map-filter-trunk').diagnostics, { weekdayRows: 3, rowsWithTrunkValue: 3, trunkOnlyRoutes: 1, trunkOnlyRows: 3, rowsSkippedNoMask: 0, rowsSkippedMaskMismatch: 0 });
  // The trunk value is a shadow: the input rows keep their own D1 value.
  assert.equal(rows[0].properties.routeFilterHeadwayByPeriod.midday, 24);
});

test('map-filter-trunk keeps every stop of a route that passes on its own value (CIV-1579)', () => {
  const rows = trunkRows([',*3', ',*3', ',*3']);
  assert.deepEqual(countedStops(rows, 30, 'map-filter-trunk').sort(), countedStops(rows, 30, 'map-filter').sort());
  assert.equal(countedStops(rows, 30, 'map-filter-trunk').length, 9);
  // Rows without the trunk fields (an older release) read as map-filter.
  for (const slug of ['ttc', 'windsor', 'trimet']) assert.deepEqual(routesAt(slug, 15, 'map-filter-trunk'), routesAt(slug, 15, 'map-filter'));
});

test('map-filter-trunk skips a trunk-only row whose mask is missing or the wrong length (CIV-1579)', () => {
  const rows = trunkRows(['1*2', undefined, '1*3']);
  const { diagnostics } = qualifyingRows(rows, 15, 'map-filter-trunk');
  assert.equal(diagnostics.rowsSkippedMaskMismatch, 1);
  assert.equal(diagnostics.rowsSkippedNoMask, 1);
  assert.equal(countedStops(rows, 15, 'map-filter-trunk').length, 3);
});
