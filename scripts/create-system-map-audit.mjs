import fs from 'node:fs';

const catalogPath = 'docs/research/frequent-service-catalog.json';
const outputPath = 'docs/research/system-map-audit-2026-09.json';
const preservedMapDirectory = '/Users/ryan/Desktop/Data/System Maps/Atlas Frequent Service';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const records = catalog.agencies.slice(0, 50).map((agency, index) => ({
  auditOrder: index + 1,
  agencyId: agency.agencyId,
  agencyName: agency.agencyName,
  country: agency.country,
  region: agency.region,
  status: 'pending_map_review',
  mapCandidates: agency.sources
    .filter(source => source.type === 'system_map')
    .map((source, sourceIndex) => ({
      url: source.url,
      sourceType: source.type,
      localFile: fs.existsSync(`${preservedMapDirectory}/${agency.agencyId}-${sourceIndex + 1}`)
        ? `${agency.agencyId}-${sourceIndex + 1}`
        : null,
    })),
  preservedFiles: agency.sources
    .filter(source => source.type === 'system_map')
    .map((source, sourceIndex) => `${agency.agencyId}-${sourceIndex + 1}`)
    .filter(file => fs.existsSync(`${preservedMapDirectory}/${file}`)),
  mapDate: null,
  mapPageOrSection: null,
  exactMapWording: null,
  thresholdMinutes: null,
  thresholdText: null,
  serviceSpan: null,
  days: null,
  geography: null,
  mode: null,
  evidenceNotes: null,
}));

const audit = {
  auditVersion: 1,
  createdAt: '2026-09-18',
  sourceCatalog: catalogPath,
  scope: 'First 50 agencies in catalog order; system-map evidence only.',
  statusRules: {
    numeric_definition_on_map: 'The official system map visibly names frequent/high-frequency service and gives a numeric threshold or range.',
    qualitative_definition_on_map: 'The official system map visibly names frequent/high-frequency service without a numeric threshold.',
    no_definition_on_map: 'The official system map was reviewed but contains no named frequent/high-frequency definition.',
    map_unavailable: 'No official system map could be located or accessed for review.',
    pending_map_review: 'The map has not yet been reviewed.',
  },
  evidenceRules: [
    'Only official system maps count toward the verified chart.',
    'Planning documents, route pages, schedules, and generic service bands are supplementary only.',
    'Record the exact map wording and page/legend location; do not paraphrase a definition into existence.',
    'Preserve a local PDF/image when legally and technically practical; otherwise preserve the official URL and retrieval date.',
    'A missing map definition is a valid result and must not be converted into a numeric definition.',
  ],
  records,
};

fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Created ${outputPath} with ${records.length} pending records.`);
