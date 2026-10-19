import { pointInGeometry, coverageForAgencies } from './coverage.mjs';

const STATE_FIPS = {
  Alabama: '01', Alaska: '02', Arizona: '04', Arkansas: '05', California: '06', Colorado: '08', Connecticut: '09', Delaware: '10',
  'District of Columbia': '11', Florida: '12', Georgia: '13', Hawaii: '15', Idaho: '16', Illinois: '17', Indiana: '18', Iowa: '19',
  Kansas: '20', Kentucky: '21', Louisiana: '22', Maine: '23', Maryland: '24', Massachusetts: '25', Michigan: '26', Minnesota: '27',
  Mississippi: '28', Missouri: '29', Montana: '30', Nebraska: '31', Nevada: '32', 'New Hampshire': '33', 'New Jersey': '34',
  'New Mexico': '35', 'New York': '36', 'North Carolina': '37', 'North Dakota': '38', Ohio: '39', Oklahoma: '40', Oregon: '41',
  Pennsylvania: '42', 'Rhode Island': '44', 'South Carolina': '45', 'South Dakota': '46', Tennessee: '47', Texas: '48', Utah: '49',
  Vermont: '50', Virginia: '51', Washington: '53', 'West Virginia': '54', Wisconsin: '55', Wyoming: '56',
};

export const US_STATE_FIPS = STATE_FIPS;

function geometryBounds(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = coordinates => {
    if (typeof coordinates[0] === 'number') {
      bounds[0] = Math.min(bounds[0], coordinates[0]); bounds[1] = Math.min(bounds[1], coordinates[1]);
      bounds[2] = Math.max(bounds[2], coordinates[0]); bounds[3] = Math.max(bounds[3], coordinates[1]); return;
    }
    coordinates.forEach(visit);
  };
  visit(geometry.coordinates); return bounds;
}

function mergeBounds(rows) {
  return [Math.min(...rows.map(row => row[0])), Math.min(...rows.map(row => row[1])), Math.max(...rows.map(row => row[2])), Math.max(...rows.map(row => row[3]))];
}

export function bufferedBounds(bounds, miles = 25) {
  const latitude = Math.max(-89, Math.min(89, (bounds[1] + bounds[3]) / 2));
  const latDegrees = miles / 69;
  const lonDegrees = miles / (69 * Math.max(0.15, Math.cos(latitude * Math.PI / 180)));
  return [bounds[0] - lonDegrees, bounds[1] - latDegrees, bounds[2] + lonDegrees, bounds[3] + latDegrees];
}

function featureState(feature) {
  const p = feature.properties ?? {};
  return { id: String(p.GEOID ?? p.STATEFP ?? p.STATE ?? p.id), name: String(p.NAME ?? p.name), geometry: feature.geometry };
}

export function normalizeStates(collection) { return collection.features.map(featureState); }

export function statesForStops(stops, states) {
  const found = new Set();
  for (const stop of stops) {
    const point = [stop.lon, stop.lat];
    for (const state of states) if (pointInGeometry(point, state.geometry)) { found.add(state.id); break; }
  }
  return found;
}

export function deriveServiceBundles({ agencies, coverage, states, bufferMiles = 25 }) {
  const byId = new Map(states.map(state => [state.id, state]));
  const parent = new Map(states.map(state => [state.id, state.id]));
  const find = id => { let root = id; while (parent.get(root) !== root) root = parent.get(root); while (parent.get(id) !== id) { const next = parent.get(id); parent.set(id, root); id = next; } return root; };
  const join = (a, b) => { const left = find(a); const right = find(b); if (left !== right) parent.set(right, left); };
  const agencyRows = [];
  for (const item of coverage) {
    const stateIds = [...statesForStops(item.stops, states)];
    if (!stateIds.length) continue;
    for (const stateId of stateIds.slice(1)) join(stateIds[0], stateId);
    const stopBounds = item.stops.length ? [Math.min(...item.stops.map(stop => stop.lon)), Math.min(...item.stops.map(stop => stop.lat)), Math.max(...item.stops.map(stop => stop.lon)), Math.max(...item.stops.map(stop => stop.lat))] : null;
    agencyRows.push({ slug: item.slug, name: item.name, stateIds, qualifyingRoutes: item.qualifyingRoutes, stopCount: item.stops.length, stopBounds });
  }
  const groups = new Map();
  for (const row of agencyRows) {
    const root = find(row.stateIds[0]); const group = groups.get(root) ?? { stateIds: new Set(), agencies: [], stopCount: 0, qualifyingRoutes: 0 };
    row.stateIds.forEach(id => group.stateIds.add(id)); group.agencies.push(row); group.stopCount += row.stopCount; group.qualifyingRoutes += row.qualifyingRoutes; groups.set(root, group);
  }
  return [...groups.values()].map(group => {
    const stateRows = [...group.stateIds].map(id => byId.get(id)).filter(Boolean);
    const bounds = bufferedBounds(mergeBounds(group.agencies.filter(row => row.stopBounds).map(row => row.stopBounds)), bufferMiles);
    return {
      id: stateRows.map(state => state.id).sort().join('-'),
      states: stateRows.map(({ geometry, ...state }) => state).sort((a, b) => a.name.localeCompare(b.name)),
      agencySlugs: group.agencies.map(row => row.slug).sort(),
      agencies: group.agencies.map(({ slug, name }) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
      qualifyingRoutes: group.qualifyingRoutes,
      stopCount: group.stopCount,
      bounds,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeCoverageReports(reports) {
  if (!reports.length) throw new Error('At least one report is required');
  const areas = new Map(); let duplicateAreaCount = 0;
  for (const report of reports) for (const area of report.areas ?? []) {
    const existing = areas.get(area.id);
    if (existing) { duplicateAreaCount++; existing.covered ||= area.covered; }
    else areas.set(area.id, { ...area });
  }
  const rows = [...areas.values()]; const byCmaMap = new Map();
  for (const row of rows) {
    const current = byCmaMap.get(row.cmaId) ?? { id: row.cmaId, name: row.cmaName, population: 0, coveredPopulation: 0 };
    current.population += row.population; if (row.covered) current.coveredPopulation += row.population; byCmaMap.set(row.cmaId, current);
  }
  const byCma = [...byCmaMap.values()].map(row => ({ ...row, uncoveredPopulation: row.population - row.coveredPopulation, coveredPercent: row.population ? row.coveredPopulation / row.population * 100 : 0 }));
  const population = byCma.reduce((sum, row) => sum + row.population, 0); const coveredPopulation = byCma.reduce((sum, row) => sum + row.coveredPopulation, 0);
  const selectedCmas = byCma.map(({ id, name }) => ({ id, name }));
  const agencies = [...new Map(reports.flatMap(report => report.agencies ?? []).map(agency => [agency.slug, agency])).values()];
  return {
    ...reports[0], generatedAt: new Date().toISOString(), areas: rows, byCma, agencies,
    scope: { ...reports[0].scope, agencyCount: agencies.length, batchCount: reports.length, selectedCmaCount: selectedCmas.length, selectedCmas, atlasCoveragePopulation: population, coveredPopulation, uncoveredPopulation: population - coveredPopulation, coveredPercent: population ? coveredPopulation / population * 100 : 0 },
    diagnostics: { ...reports[0].diagnostics, batchCount: reports.length, duplicateAreaCount, populationAreaCount: rows.length },
  };
}
