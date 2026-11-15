import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const CANADIAN_REGIONS = new Set([
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland',
  'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Ontario',
  'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon',
]);

export const US_REGIONS = new Set([
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
  'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Washington DC',
]);

const PERIODS = ['amPeak', 'midday', 'pmPeak'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 7));
const EARTH_RADIUS = 6_371_000;

const num = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replaceAll(',', ''));
  return Number.isFinite(n) ? n : null;
};

export function pointInGeometry(point, geometry) {
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]; const b = ring[j];
      if (!a || !b) continue;
      const hit = ((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (hit) inside = !inside;
    }
    return inside;
  };
  const polygon = (rings) => inRing(rings[0]) && !rings.slice(1).some(inRing);
  if (geometry.type === 'Polygon') return polygon(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(polygon);
  return false;
}

function distance(a, b) {
  const lat1 = a[1] * Math.PI / 180; const lat2 = b[1] * Math.PI / 180;
  const dLat = lat2 - lat1; const dLon = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

function centroid(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates;
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of rings) {
    const ring = polygon[0]; let area = 0; let x = 0; let y = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]; const b = ring[i + 1]; const cross = a[0] * b[1] - b[0] * a[1];
      area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
    }
    const point = Math.abs(area) < 1e-12 ? ring[0] : [x / (3 * area), y / (3 * area)];
    if (pointInGeometry(point, geometry)) return point;
  }
  const first = rings?.[0]?.[0]?.[0];
  return first ?? null;
}

export function populationAreas(collection, populationProperty) {
  const keys = populationProperty ? [populationProperty] : ['population', 'POP2021', 'POP100', 'Population', 'pop2021'];
  return collection.features.flatMap((feature, index) => {
    const props = feature.properties ?? {};
    const population = keys.map(key => num(props[key])).find(value => value != null);
    const point = centroid(feature.geometry);
    if (population == null || population < 0 || !point) return [];
    return [{
      id: String(props.DAUID ?? props.DGUID ?? props.GEOID ?? props.GEOID20 ?? props.id ?? props.ID ?? `area-${index + 1}`),
      population, point, geometry: feature.geometry, properties: props,
    }];
  });
}

export function metros(collection) {
  return collection.features.map((feature, index) => {
    const p = feature.properties ?? {};
    return {
      id: String(p.CMAUID ?? p.CAUID ?? p.GEOUID ?? p.GEOID ?? p.id ?? p.ID ?? `metro-${index + 1}`),
      name: String(p.CMANAME ?? p.CANAME ?? p.name ?? p.NAME ?? `Metro ${index + 1}`),
      geometry: feature.geometry,
    };
  });
}

/**
 * Which frequency rule decides a qualifying route (CIV-1182). Set with COVERAGE_RULE:
 * - "study" (default): the September 2026 rule, kept so the published figures can be reproduced. It needs Atlas's
 *   headwayByPeriodSustained flag, which drops some very frequent lines (CIV-1179).
 * - "no-sustained": the same rule without that flag (a sensitivity check).
 * - "map-filter": the map's own frequency filter. Not built: it waits for Ryan's pick of the rule.
 */
export const RULES = ['study', 'no-sustained', 'map-filter'];
export function coverageRule() {
  const rule = process.env.COVERAGE_RULE || 'study';
  if (!RULES.includes(rule)) throw new Error(`COVERAGE_RULE must be one of ${RULES.join(', ')}`);
  if (rule === 'map-filter') throw new Error('COVERAGE_RULE=map-filter is not built yet: the rule waits for Ryan (CIV-1179)');
  return rule;
}

export function qualifies(properties, maxHeadwayMinutes = 15, rule = coverageRule()) {
  if (properties.day !== 'Weekday') return false;
  const headways = properties.headwayByPeriod; const sustained = properties.headwayByPeriodSustained;
  if (!headways || (rule === 'study' && !sustained)) return false;
  if (PERIODS.some(period => (rule === 'study' && sustained[period] !== true) || (num(headways[period]) ?? Infinity) > maxHeadwayMinutes)) return false;
  const hourly = properties.headwayByHour;
  return !hourly || HOURS.every(hour => (num(hourly[hour]) ?? Infinity) <= maxHeadwayMinutes);
}

export function qualifyingRoutes(features, maxHeadwayMinutes = 15) {
  const groups = new Map();
  for (const feature of features) {
    const p = feature.properties ?? {};
    if (p.day !== 'Weekday') continue;
    const group = `${p.routeShortName ?? ''}::${p.routeBranch ?? ''}`;
    const direction = String(p.directionId ?? p.headsign ?? 'unknown');
    const directions = groups.get(group) ?? new Map();
    const rows = directions.get(direction) ?? [];
    rows.push(feature); directions.set(direction, rows); groups.set(group, directions);
  }
  const result = [];
  for (const directions of groups.values()) {
    if ([...directions.values()].every(rows => rows.every(feature => qualifies(feature.properties ?? {}, maxHeadwayMinutes)))) {
      for (const rows of directions.values()) result.push(...rows);
    }
  }
  return result;
}

// #1367: Atlas's published files. Reads from GitHub runners to data.transitatlas.fyi hit Cloudflare
// bot challenges (403 "Just a moment...") and dropped connections (ECONNRESET / undici "terminated"),
// so when the workflow passes the read-only R2 keys, files are read straight from the R2 bucket over
// S3 (signed GET, no extra packages) and Cloudflare's bot checks are out of the path. Without keys
// (a local run) they come from the public domain. Either way, a thrown network error, including one
// while reading the body, is retried like an error status, with a long backoff.
export const DEFAULT_ATLAS_BASE_URL = 'https://data.transitatlas.fyi';
export const ATLAS_FETCH_HEADERS = { 'User-Agent': 'atlas-coverage-study/1.0', Accept: 'application/json' };
const sleep = ms => new Promise(done => setTimeout(done, ms));

function describeResponse(response, url, body) {
  const by = [response.headers.get('server'), response.headers.get('cf-mitigated') && `cf-mitigated=${response.headers.get('cf-mitigated')}`, response.headers.get('cf-ray') && `cf-ray=${response.headers.get('cf-ray')}`].filter(Boolean).join(' ');
  return `${response.status} ${url}${by ? ` (${by})` : ''}${body ? `: ${body}` : ''}`;
}

/** One request, retried on an error status (except 404) or a thrown network error. */
export async function json(url, { tries = 5, delayMs = 10000, headers = ATLAS_FETCH_HEADERS, label = url } = {}) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(url, { headers: typeof headers === 'function' ? headers() : headers });
      if (response.ok) return await response.json();
      const body = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      lastError = new Error(describeResponse(response, label, body));
      if (response.status === 404) throw lastError;
    } catch (error) {
      if (error === lastError) throw error;
      lastError = new Error(`${label}: ${error?.message ?? error}${error?.cause?.code ? ` (${error.cause.code})` : ''}`, { cause: error });
    }
    // 10 s, 20 s, 40 s, 80 s, each plus up to 25% jitter so parallel reads don't retry in lockstep.
    if (attempt < tries - 1) await sleep(delayMs * 2 ** attempt * (1 + Math.random() * 0.25));
  }
  throw lastError;
}

const sha256 = data => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** AWS Signature V4 headers for an S3 GET (R2 speaks S3). Exported for the signing test. */
export function signS3Get({ host, path, accessKeyId, secretAccessKey, region = 'auto', date = new Date(), payloadHash = 'UNSIGNED-PAYLOAD', extraHeaders = {} }) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const headers = { host, ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])), 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonical = ['GET', path, '', names.map(n => `${n}:${String(headers[n]).trim()}\n`).join(''), signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  const { host: _host, ...sent } = headers;
  return { ...sent, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

/** The read-only R2 settings the workflow passes, or null when this run has none. */
export function atlasR2Config(env = process.env) {
  const accountId = env.R2_ACCOUNT_ID, bucket = env.R2_BUCKET_NAME;
  const accessKeyId = env.R2_RO_ACCESS_KEY_ID, secretAccessKey = env.R2_RO_SECRET_ACCESS_KEY;
  return accountId && bucket && accessKeyId && secretAccessKey ? { accountId, bucket, accessKeyId, secretAccessKey } : null;
}

let announcedSource = false;
/** Read one Atlas file (key like "atlas/ttc.json"): R2 with read-only keys when present, else the public domain. */
export async function atlasJson(key, baseUrl = DEFAULT_ATLAS_BASE_URL, { r2 = atlasR2Config(), ...options } = {}) {
  // A non-default base URL (another environment) is read as given; the keys point at production's bucket.
  const useR2 = r2 && baseUrl.replace(/\/$/, '') === DEFAULT_ATLAS_BASE_URL;
  if (!announcedSource) {
    announcedSource = true;
    console.error(useR2 ? `Atlas files: read from R2 bucket ${r2.bucket} with read-only keys (#1367)` : `Atlas files: read from ${baseUrl} (no read-only R2 keys)`);
  }
  if (!useR2) return json(`${baseUrl.replace(/\/$/, '')}/${key}`, options);
  const host = `${r2.accountId}.r2.cloudflarestorage.com`;
  const path = `/${encodeURIComponent(r2.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  // Signed per attempt, so a retry after a long backoff carries a fresh date.
  return json(`https://${host}${path}`, { ...options, label: `r2://${r2.bucket}/${key}`, headers: () => ({ Accept: 'application/json', ...signS3Get({ host, path, accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey }) }) });
}

export async function coverageForAgencies(agencies, baseUrl = DEFAULT_ATLAS_BASE_URL, maxHeadwayMinutes = 15) {
  const result = [];
  for (let start = 0; start < agencies.length; start += 6) {
    const batch = agencies.slice(start, start + 6);
    result.push(...await Promise.all(batch.map(async agency => {
      const [routes, stopMeta] = await Promise.all([
        atlasJson(`atlas/${agency.slug}.json`, baseUrl),
        atlasJson(`atlas/${agency.slug}-stops-meta.json`, baseUrl),
      ]);
      const good = qualifyingRoutes(routes.features, maxHeadwayMinutes);
      const ids = new Set(good.flatMap(feature => Array.isArray(feature.properties?.stopOrder) ? feature.properties.stopOrder.map(String) : []));
      const stops = (stopMeta.stops ?? []).filter(stop => ids.has(String(stop.id)) && num(stop.lat) != null && num(stop.lon) != null).map(stop => ({
        id: String(stop.id), lat: num(stop.lat), lon: num(stop.lon), agency: agency.slug,
      }));
      return { slug: agency.slug, name: agency.name, lastRefreshedAt: agency.lastRefreshedAt, routes: routes.features.length, qualifyingRoutes: good.length, stops };
    })));
  }
  return { agencies, coverage: result };
}

export async function atlasCoverage(agencies, baseUrl = DEFAULT_ATLAS_BASE_URL, maxHeadwayMinutes = 15) {
  return coverageForAgencies(agencies.filter(agency => CANADIAN_REGIONS.has(agency.region)), baseUrl, maxHeadwayMinutes);
}

function key(lon, lat) { return `${lon.toFixed(6)},${lat.toFixed(6)}`; }
function cell(lon, lat) { return `${Math.floor(lon / 0.01)},${Math.floor(lat / 0.01)}`; }

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

function graph(network, bounds) {
  const nodes = []; const byKey = new Map(); const cells = new Map(); let edges = 0;
  const add = (point) => {
    const k = key(point[0], point[1]); const found = byKey.get(k); if (found != null) return found;
    const id = nodes.length; nodes.push({ point, edges: [] }); byKey.set(k, id);
    const bucket = cells.get(cell(...point)) ?? []; bucket.push(id); cells.set(cell(...point), bucket); return id;
  };
  for (const feature of network.features) {
    if (feature.geometry.type !== 'LineString') continue;
    if (bounds) {
      const featureBounds = geometryBounds(feature.geometry);
      if (featureBounds[2] < bounds[0] || featureBounds[0] > bounds[2] || featureBounds[3] < bounds[1] || featureBounds[1] > bounds[3]) continue;
    }
    const points = feature.geometry.coordinates;
    for (let i = 1; i < points.length; i++) {
      const a = add(points[i - 1]); const b = add(points[i]); if (a === b) continue;
      const metres = distance(points[i - 1], points[i]); nodes[a].edges.push([b, metres]); nodes[b].edges.push([a, metres]); edges++;
    }
  }
  return { nodes, cells, edges };
}

function nearest(g, point) {
  let best = null; const cx = Math.floor(point[0] / 0.01); const cy = Math.floor(point[1] / 0.01);
  for (let radius = 0; radius <= 100; radius++) {
    for (let x = cx - radius; x <= cx + radius; x++) for (let y = cy - radius; y <= cy + radius; y++) {
      for (const id of g.cells.get(`${x},${y}`) ?? []) {
        const metres = distance(point, g.nodes[id].point); if (!best || metres < best.metres) best = { id, metres };
      }
    }
    if (best && radius >= 2 && best.metres < (radius - 1) * 1000) break;
  }
  return best;
}

function distancesFromStops(g, stops, limit) {
  const distances = new Array(g.nodes.length).fill(Infinity); const queue = [];
  const push = item => {
    queue.push(item);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (queue[parent][1] <= queue[index][1]) break;
      [queue[parent], queue[index]] = [queue[index], queue[parent]];
      index = parent;
    }
  };
  const pop = () => {
    const first = queue[0]; const last = queue.pop();
    if (queue.length && last) {
      queue[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1; const right = left + 1; let smallest = index;
        if (left < queue.length && queue[left][1] < queue[smallest][1]) smallest = left;
        if (right < queue.length && queue[right][1] < queue[smallest][1]) smallest = right;
        if (smallest === index) break;
        [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
        index = smallest;
      }
    }
    return first;
  };
  for (const stop of stops) { const snap = nearest(g, [stop.lon, stop.lat]); if (snap && snap.metres < distances[snap.id]) { distances[snap.id] = snap.metres; push([snap.id, snap.metres]); } }
  while (queue.length) {
    const [id, current] = pop(); if (current !== distances[id] || current > limit) continue;
    for (const [to, edge] of g.nodes[id].edges) { const next = current + edge; if (next <= limit && next < distances[to]) { distances[to] = next; push([to, next]); } }
  }
  return distances;
}

export function calculateReport({ agencies, coverage, population, metroBoundaries, network, walkMinutes = 10, walkingSpeedMps = 1.4, maxHeadwayMinutes = 15, populationVintage = '2021', populationGeography = 'Statistics Canada dissemination area', populationAssignment = 'Dissemination-area representative point' }) {
  const stops = coverage.flatMap(item => item.stops);
  const selected = metroBoundaries.filter(metro => stops.some(stop => pointInGeometry([stop.lon, stop.lat], metro.geometry)));
  const selectedIds = new Set(selected.map(metro => metro.id));
  const areas = population.flatMap(area => {
    const metro = selected.find(candidate => pointInGeometry(area.point, candidate.geometry));
    return metro ? [{ ...area, metro }] : [];
  });
  const metroBounds = selected.map(metro => geometryBounds(metro.geometry));
  const bounds = metroBounds.length ? [Math.min(...metroBounds.map(row => row[0])) - 0.05, Math.min(...metroBounds.map(row => row[1])) - 0.05, Math.max(...metroBounds.map(row => row[2])) + 0.05, Math.max(...metroBounds.map(row => row[3])) + 0.05] : null;
  const g = graph(network, bounds); const max = walkMinutes * 60 * walkingSpeedMps; const distances = distancesFromStops(g, stops, max);
  const results = areas.map(area => { const snap = nearest(g, area.point); return { id: area.id, population: area.population, covered: Boolean(snap && distances[snap.id] + snap.metres <= max), cmaId: area.metro.id, cmaName: area.metro.name, geometry: area.geometry, properties: area.properties }; });
  const byCma = selected.filter(metro => selectedIds.has(metro.id)).map(metro => {
    const rows = results.filter(row => row.cmaId === metro.id); const total = rows.reduce((sum, row) => sum + row.population, 0); const coveredPopulation = rows.filter(row => row.covered).reduce((sum, row) => sum + row.population, 0);
    return { id: metro.id, name: metro.name, population: total, coveredPopulation, uncoveredPopulation: total - coveredPopulation, coveredPercent: total ? coveredPopulation / total * 100 : 0 };
  });
  const total = byCma.reduce((sum, row) => sum + row.population, 0); const coveredPopulation = byCma.reduce((sum, row) => sum + row.coveredPopulation, 0);
  return {
    generatedAt: new Date().toISOString(),
    definition: { walkMinutes, walkingSpeedMps, frequentHeadwayMinutes: maxHeadwayMinutes, frequentWindow: '07:00–19:00', day: 'Weekday', populationVintage, populationGeography, populationAssignment },
    scope: { agencyCount: agencies.length, selectedCmaCount: selected.length, selectedCmas: selected.map(({ id, name }) => ({ id, name })), atlasCoveragePopulation: total, coveredPopulation, uncoveredPopulation: total - coveredPopulation, coveredPercent: total ? coveredPopulation / total * 100 : 0 },
    byCma,
    agencies: coverage.map(item => ({ slug: item.slug, name: item.name, routeCount: item.routes, qualifyingRouteCount: item.qualifyingRoutes, stopCount: item.stops.length, lastRefreshedAt: item.lastRefreshedAt })),
    diagnostics: { networkNodeCount: g.nodes.length, networkEdgeCount: g.edges, populationAreaCount: results.length, populationAreasOutsideAtlasCmas: population.length - areas.length },
    areas: results.map(({ geometry, properties, ...row }) => row),
    map: { type: 'FeatureCollection', features: results.map(row => ({ type: 'Feature', geometry: row.geometry, properties: { ...row.properties, population: row.population, covered: row.covered, cmaId: row.cmaId, cmaName: row.cmaName } })) },
  };
}

export async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
