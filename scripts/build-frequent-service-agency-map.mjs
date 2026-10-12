import fs from 'node:fs';

// Maps every frequent-service catalog record and system-map audit record to Atlas
// registry slugs. Matching uses only the official agency name and official URLs;
// anything that does not resolve to exactly one registry agency is listed as
// unmatched rather than guessed.

const registryPath = 'public/data/index.json';
const catalogPath = 'docs/research/frequent-service-research-2026-09/catalog.json';
const auditPath = 'docs/research/system-map-audit-2026-09/data.json';
const outputPath = 'docs/research/frequent-service-research-2026-09/atlas-agency-map.json';

const ATLAS_COUNTRIES = new Set(['Canada', 'United States', 'France', 'Mexico']);

// Hand-checked matches. Each note says what official evidence links the two.
const MANUAL = {
  ridekc: { slugs: ['kcata'], relation: 'one-to-one', note: 'kcata.org (registry websiteUrl) redirects to ridekc.org, the URL of the reviewed system map.' },
  'greater-dayton-rta': { slugs: ['dayton'], relation: 'one-to-one', note: 'i-riderta.org (registry websiteUrl) redirects to iriderta.org, the URL of the reviewed source.' },
  'valley-metro-phoenix': { slugs: ['valleymetro'], relation: 'one-to-one', note: 'Audit mergedAgencyIds already names valleymetro; same official name, Arizona.' },
  'mountain-metro': { slugs: ['mountainmetro'], relation: 'one-to-one', note: 'Official name Mountain Metropolitan Transit, Colorado Springs; the reviewed map is on coloradosprings.gov (the city runs the agency).' },
  'embark-oklahoma-city': { slugs: ['embark'], relation: 'one-to-one', note: 'Same official name, Oklahoma City. Registry websiteUrl for embark points at OU CART (ou.edu/cart), which looks like a registry error.' },
  'nj-transit': { slugs: ['njt-bus', 'njt-rail'], relation: 'one-to-many', note: 'One NJ Transit system map covers both registry feeds.' },
  'mta-nyc': { slugs: ['nyct-subway', 'nyct-bus-manhattan', 'nyct-bus-brooklyn', 'nyct-bus-queens', 'nyct-bus-bronx', 'nyct-bus-si'], relation: 'one-to-many', note: 'New York City Transit is split into one subway and five borough bus feeds in the registry. MTA Bus Company, LIRR and Metro-North are separate operators and are not included.' },
};

// Not in the registry even though a registry agency lists the city or shares a parent brand.
const NOT_IN_REGISTRY_NOTES = {
  'bc-transit-prince-george': 'BC Transit runs many separate local systems; Prince George has no registry agency.',
  'chilliwack-transit': 'Separate BC Transit system; the registry bc-fraser-valley agency lists Chilliwack as a city but is not this system.',
  'vernon-regional-transit': 'Separate BC Transit system with no registry agency.',
  'quesnel-transit': 'Separate BC Transit system with no registry agency.',
  'port-alberni-transit': 'Separate BC Transit system with no registry agency.',
  'powell-river-transit': 'Separate BC Transit system with no registry agency.',
  'airdrie-transit': 'Separate municipal operator; Calgary Transit lists Airdrie as a city but is not this agency.',
  'st-albert-transit': 'Separate municipal operator; Edmonton Transit lists St. Albert as a city but is not this agency.',
  'strathcona-county-transit': 'Separate municipal operator; Edmonton Transit lists Sherwood Park as a city but is not this agency.',
  'seattle-dot': 'SDOT is a city department, not a registry operator; its frequent network is run by King County Metro and others.',
};

const GENERIC_HOSTS = /(amazonaws\.com|cloudfront\.net|digitaloceanspaces\.com|azureedge\.(us|net)|squarespace|wixstatic|google\.com|arcgis\.com|issuu\.com|civicplus\.com|ctfassets\.net|bctransit\.com|mta\.info|ratpdev\.com)$/;

function host(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(www|m)\./, '');
  } catch {
    return '';
  }
}

function registrable(h) {
  const parts = h.split('.');
  const twoLevel = parts.length > 2 && ['co', 'com', 'gov', 'org', 'qc', 'on', 'bc', 'ab'].includes(parts.at(-2)) && parts.at(-1).length === 2;
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

function normalizeName(name) {
  return (name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')).agencies;
const bySlug = new Map(registry.map(agency => [agency.slug, agency]));
const byName = new Map();
const byHost = new Map();
for (const agency of registry) {
  const key = normalizeName(agency.name);
  byName.set(key, [...(byName.get(key) ?? []), agency.slug]);
  const h = host(agency.websiteUrl ?? '');
  if (h && !GENERIC_HOSTS.test(h)) {
    for (const k of new Set([h, registrable(h)])) byHost.set(k, new Set([...(byHost.get(k) ?? []), agency.slug]));
  }
}

function match(record, urls) {
  if (MANUAL[record.agencyId]) return { ...MANUAL[record.agencyId], method: 'manual' };
  if (bySlug.has(record.agencyId)) return { slugs: [record.agencyId], relation: 'one-to-one', method: 'slug-exact' };
  const named = byName.get(normalizeName(record.agencyName)) ?? [];
  if (named.length === 1) return { slugs: named, relation: 'one-to-one', method: 'official-name' };
  const candidates = new Set();
  for (const url of urls) {
    const h = host(url);
    if (!h || GENERIC_HOSTS.test(h)) continue;
    for (const k of [h, registrable(h)]) for (const slug of byHost.get(k) ?? []) candidates.add(slug);
  }
  if (candidates.size === 1) return { slugs: [...candidates], relation: 'one-to-one', method: 'official-url' };
  const outOfScope = !ATLAS_COUNTRIES.has(record.country);
  return {
    slugs: [],
    relation: outOfScope ? 'outside-atlas-coverage' : 'not-in-registry',
    method: 'unmatched',
    note: NOT_IN_REGISTRY_NOTES[record.agencyId] ?? (candidates.size > 1 ? `Several registry agencies share this URL: ${[...candidates].sort().join(', ')}` : undefined),
  };
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).agencies;
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8')).records;

const rows = [];
for (const record of catalog) {
  rows.push({ source: 'catalog', agencyId: record.agencyId, agencyName: record.agencyName, country: record.country, region: record.region,
    ...match(record, record.sources.map(source => source.url)) });
}
for (const record of audit) {
  const urls = [...(record.mapCandidates ?? []), ...(record.reviewSources ?? [])].map(source => source.url);
  rows.push({ source: 'audit', agencyId: record.agencyId, agencyName: record.agencyName, country: record.country, region: record.region,
    ...match(record, urls) });
}
for (const row of rows) {
  row.atlasNames = row.slugs.map(slug => bySlug.get(slug).name);
  for (const slug of row.slugs) if (!bySlug.has(slug)) throw new Error(`Unknown registry slug ${slug} for ${row.agencyId}`);
}

// Audit records that resolve to the same registry agency (left in data.json; see README).
const auditBySlug = new Map();
for (const row of rows.filter(r => r.source === 'audit')) {
  for (const slug of row.slugs) auditBySlug.set(slug, [...(auditBySlug.get(slug) ?? []), row.agencyId]);
}
const auditDuplicates = [...auditBySlug].filter(([, ids]) => ids.length > 1).map(([slug, agencyIds]) => ({ slug, agencyIds }));

function summarize(source) {
  const subset = rows.filter(row => row.source === source);
  const count = predicate => subset.filter(predicate).length;
  return {
    records: subset.length,
    matched: count(row => row.slugs.length > 0),
    byMethod: Object.fromEntries(['slug-exact', 'official-name', 'official-url', 'manual'].map(m => [m, count(row => row.method === m)])),
    oneToMany: count(row => row.relation === 'one-to-many'),
    notInRegistry: count(row => row.relation === 'not-in-registry'),
    outsideAtlasCoverage: count(row => row.relation === 'outside-atlas-coverage'),
    uniqueAtlasSlugs: new Set(subset.flatMap(row => row.slugs)).size,
  };
}

const output = {
  builtAt: '2026-10-11',
  registry: registryPath,
  registryAgencyCount: registry.length,
  method: 'Exact registry slug, then exact official name (one registry match only), then official URL host (one registry match only), then the hand-checked MANUAL table in scripts/build-frequent-service-agency-map.mjs. Anything else is unmatched; nothing is guessed.',
  summary: { catalog: summarize('catalog'), audit: summarize('audit'), auditDuplicateSlugs: auditDuplicates.length },
  auditDuplicates,
  records: rows,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.summary));
