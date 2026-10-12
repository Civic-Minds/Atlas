import fs from 'node:fs';

// One row per Atlas registry agency that appears in the frequent-service catalog
// or the system-map audit. This is the single source for a cross-agency
// "frequent" comparison: it joins both research sets through atlas-agency-map.json
// and attaches the machine-checked definition quote from definition-quotes-2026-10-11.json.

const dir = 'docs/research/frequent-service-research-2026-09';
const catalogPath = `${dir}/catalog.json`;
const auditPath = 'docs/research/system-map-audit-2026-09/data.json';
const mapPath = `${dir}/atlas-agency-map.json`;
const quotesPath = `${dir}/definition-quotes-2026-10-11.json`;
const registryPath = 'public/data/index.json';
const outputPath = `${dir}/frequent-definitions-by-agency.json`;

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const catalog = new Map(read(catalogPath).agencies.map(record => [record.agencyId, record]));
const audit = new Map(read(auditPath).records.map(record => [record.agencyId, record]));
const agencyMap = read(mapPath).records;
const quotes = new Map(read(quotesPath).quotes.map(quote => [quote.slug, quote]));
const registry = new Map(read(registryPath).agencies.map(agency => [agency.slug, agency]));

// Verified quotes that are real and current but are not a network-wide frequent
// tier in operation today. Kept with their quote, not counted as a definition.
const NARROW_SCOPE = {
  annapolis: 'One electric trolley service ("Ten Minute Trolleys"), not a network tier.',
  annemasse: 'Two tram lines (T1, T2) at 10 minutes in the weekday peak; no tier name.',
  avignon: 'Only the single tram line publishes headways; no named frequent tier.',
  blacksburg: '"Full Service" is a semester-calendar service level for the whole system, not a frequent tier.',
  'duluth-transit': 'Two named Go Line routes at 15 minutes; route labels, not a tier definition.',
  embark: 'Describes the single RAPID NW BRT line, not a network tier.',
  go: 'A future GO Expansion service target for core segments, not a current tier.',
  'rtd-denver': 'Published by the City and County of Denver for Denver city routes only; RTD itself names no frequent tier.',
  timmins: 'Describes one conventional corridor (Timmins-Porcupine-South Porcupine), not a network tier.',
};

// Quotes from plans that define a proposed or future network, or that use
// "frequent" as an analytical or land-use term, rather than a tier the agency
// runs and publishes today.
const PLANNED = {
  abqride: 'ABQ RIDE Forward (2025) proposed Recovery Network.',
  asheville: 'City explainer of the draft ART network (proposal).',
  avta: '2020 strategic plan; states AVTA runs no routes at that level and recommends creating one.',
  'bc-fraser-valley': 'Transit Future Action Plan (2024); the FTN route is described as future or developing.',
  brandon: 'Transit Master Plan route types for a proposed network.',
  'comox-valley': 'Transit Future Plan (2014), planned network.',
  grt: 'Business plan page describing a proposed frequent transit network.',
  guelph: 'Official Plan glossary (land-use policy definition).',
  kamloops: 'Transit Future Plan (2012); the 2020 action plan gives no threshold.',
  lethbridge: 'Transit Master Plan (2017) aspirational target.',
  niagara: 'Niagara Region 2041 Transportation Master Plan concept.',
  oakville: 'Five-Year Business Plan (2024) describes the FTN as a future network.',
  raba: 'Analytical label in a consultant route-profile appendix (2024 SRTP), not a rider-facing tier.',
  'saint-john': '2020 consultant audit, proposed network.',
  sfmta: 'Short Range Transit Plan FY2017-FY2030; the current map shows only unnamed frequency bands.',
  sjrtd: 'SRTP 2018 update; aspirational wording, current routes page names no tier.',
  soundtransit: 'Draft 2022 Service Plan map legend; the current service plan and map do not carry it.',
  'south-okanagan': 'Transit Future plan, planned network.',
  squamish: 'Planned network endorsed by Council in June 2025.',
  start: 'Vision 2032 COA recommendation.',
  sudbury: 'Transit Action Plan board for a proposed new system.',
  theride: 'TheRide 2045 long-range plan recommendation.',
};

// Unnamed frequency classes on a map (the same pattern the audit merge treated as
// "no definition" for Cincinnati, GCRTA and Burlington).
const UNNAMED_BANDS = {
  indygo: 'System map key has three classes (15-, 30- and 60-Minute Frequency Route) with no frequent wording.',
  fax: 'Route badge and map legend "15 Minute Frequency" are frequency classes with no frequent wording.',
};

const rows = new Map();
for (const link of agencyMap) {
  for (const slug of link.slugs) {
    const row = rows.get(slug) ?? { slug, name: registry.get(slug).name, catalog: [], audit: [] };
    const record = link.source === 'catalog' ? catalog.get(link.agencyId) : audit.get(link.agencyId);
    if (link.source === 'catalog') {
      row.catalog.push({ agencyId: record.agencyId, reviewStatus: record.reviewStatus,
        tiers: record.tiers.map(({ label, thresholdMinutes, thresholdText, span, days }) => ({ label, thresholdMinutes, thresholdText, span, days })) });
    } else {
      row.audit.push({ agencyId: record.agencyId, status: record.status, representativeThresholdMinutes: record.representativeThresholdMinutes,
        relation: link.relation, ...(record.conflictingSources ? { conflictingSources: true, conflictResolution: record.conflictResolution } : {}) });
    }
    row.country ??= record.country;
    row.region ??= record.region;
    rows.set(slug, row);
  }
}

const hasClaim = row => row.catalog.some(c => c.reviewStatus !== 'no_definition_found')
  || row.audit.some(a => a.status === 'numeric_definition_on_map' || a.status === 'qualitative_definition_on_map');

const output = [...rows.values()].sort((a, b) => a.slug.localeCompare(b.slug)).map(row => {
  const quote = quotes.get(row.slug);
  let definitionStatus;
  if (quote?.status === 'NOT-CHECKED') throw new Error(`Unfinished verification for ${row.slug}`);
  if (!quote && hasClaim(row)) throw new Error(`No verification result for ${row.slug}`);
  if (!quote) definitionStatus = 'no-definition-found';
  else definitionStatus = { found: 'verified', 'not-found': 'not-found-on-recheck', 'image-only': 'image-only', 'fetch-blocked': 'fetch-blocked' }[quote.status];
  const override = NARROW_SCOPE[row.slug] ? 'narrow-scope' : PLANNED[row.slug] ? 'planned-or-proposed' : UNNAMED_BANDS[row.slug] ? 'unnamed-frequency-bands' : null;
  if (definitionStatus === 'verified' && override) definitionStatus = override;
  const conflicts = [quote?.conflict, ...row.audit.filter(a => a.conflictingSources).map(a => a.conflictResolution)].filter(Boolean);
  return {
    slug: row.slug,
    name: row.name,
    country: row.country,
    region: row.region,
    definitionStatus,
    definition: ['verified', 'narrow-scope', 'planned-or-proposed', 'unnamed-frequency-bands', 'image-only'].includes(definitionStatus) ? {
      label: quote.label ?? null,
      thresholdMinutes: quote.thresholdMinutes ?? null,
      span: quote.span ?? null,
      days: quote.days ?? null,
      sourceUrl: quote.sourceUrl,
      sourceType: quote.sourceType ?? null,
      quote: quote.quote ?? null,
      quoteMethod: quote.quoteMethod ?? null,
      quoteCheck: quote.quoteCheck,
    } : null,
    recheckNotes: [NARROW_SCOPE[row.slug] ?? PLANNED[row.slug] ?? UNNAMED_BANDS[row.slug], quote?.notes].filter(Boolean).join(' ') || null,
    conflictingSources: conflicts.length > 0,
    conflicts,
    catalog: row.catalog,
    audit: row.audit,
  };
});

const count = key => output.reduce((counts, row) => ({ ...counts, [row[key]]: (counts[row[key]] ?? 0) + 1 }), {});
const verified = output.filter(row => row.definitionStatus === 'verified');
const payload = {
  builtAt: '2026-10-11',
  sources: { catalog: catalogPath, audit: auditPath, agencyMap: mapPath, quotes: quotesPath },
  rules: {
    unit: 'One row per Atlas registry slug. A research record that covers several registry feeds (NJ Transit, MTA New York City Transit) appears on each of them.',
    definitionStatus: {
      verified: 'A current official page publishes a named frequent tier; the quote was machine-checked against the saved page text.',
      'not-found-on-recheck': 'Earlier research recorded a definition, but the 2026-10-11 recheck found no named frequent tier on current official pages (often the earlier record was a list of route frequencies).',
      'narrow-scope': 'A machine-checked quote exists, but it covers one route, one line, part of the service area or a future target, not a network-wide frequent tier. Not a definition for comparison.',
      'planned-or-proposed': 'A machine-checked quote exists, but it comes from a plan describing a proposed or future network, or uses "frequent" as an analytical or land-use term. Not a tier in operation today.',
      'unnamed-frequency-bands': 'The current map publishes frequency classes (for example 15/30/60 minutes) without naming a frequent tier.',
      'image-only': 'The definition appears only in a map image; no machine-checkable quote.',
      'fetch-blocked': 'The official site blocks automated fetches; not rechecked.',
      'no-definition-found': 'Neither research set found a definition; not rechecked.',
    },
    thresholdMinutes: 'The slowest headway the source gives for the tier in its main weekday daytime period (for example "every 15-20 minutes on weekdays" is 20). Other periods stay in span. Null when no number is published.',
    conflicts: 'When official sources disagree, the narrower definition is used and the row is marked conflictingSources.',
  },
  summary: {
    agencies: output.length,
    byDefinitionStatus: count('definitionStatus'),
    verifiedByQuoteCheck: verified.reduce((counts, row) => ({ ...counts, [row.definition.quoteCheck]: (counts[row.definition.quoteCheck] ?? 0) + 1 }), {}),
    verifiedWithNumericThreshold: verified.filter(row => Number.isFinite(row.definition.thresholdMinutes)).length,
    conflictingSources: output.filter(row => row.conflictingSources).length,
  },
  agencies: output,
};
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload.summary));
