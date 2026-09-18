import fs from 'node:fs';

const catalogPath = 'docs/research/frequent-service-catalog.json';
const auditPath = 'docs/research/system-map-audit-2026-09.json';
const preservedMapDirectory = '/Users/ryan/Desktop/Data/System Maps/Atlas Frequent Service';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

function firstMap(record) {
  return record.mapCandidates?.find(candidate => candidate.sourceType === 'system_map') ?? record.mapCandidates?.[0] ?? null;
}

function legacyDefinition(record) {
  if (!record.exactMapWording && record.status !== 'qualitative_definition_on_map') return [];
  const source = firstMap(record);
  return [{
    id: 'map-1',
    label: record.thresholdText ?? record.exactMapWording,
    exactWording: record.exactMapWording,
    thresholdMinutes: record.thresholdMinutes,
    thresholdText: record.thresholdText,
    serviceSpan: record.serviceSpan,
    days: record.days,
    geography: record.geography,
    mode: record.mode,
    sourceType: source?.sourceType ?? 'system_map',
    sourceUrl: source?.url ?? null,
    localFile: source?.localFile ?? null,
    mapPageOrSection: record.mapPageOrSection,
    representative: Number.isInteger(record.thresholdMinutes),
    evidenceNotes: record.evidenceNotes,
  }];
}

for (const record of audit.records) {
  record.reviewBatch ??= 1;
  record.definitions ??= legacyDefinition(record);
  record.representativeThresholdMinutes ??= Number.isInteger(record.thresholdMinutes) ? record.thresholdMinutes : null;
}

const existingIds = new Set(audit.records.map(record => record.agencyId));
const nextRecords = catalog.agencies.slice(50, 100)
  .filter(agency => !existingIds.has(agency.agencyId))
  .map((agency, index) => {
    const mapSources = agency.sources.filter(source => source.type === 'system_map');
    return {
      auditOrder: audit.records.length + index + 1,
      reviewBatch: 2,
      agencyId: agency.agencyId,
      agencyName: agency.agencyName,
      country: agency.country,
      region: agency.region,
      status: 'pending_map_review',
      mapCandidates: mapSources.map((source, sourceIndex) => ({
        url: source.url,
        sourceType: source.type,
        localFile: fs.existsSync(`${preservedMapDirectory}/${agency.agencyId}-${sourceIndex + 1}`)
          ? `${agency.agencyId}-${sourceIndex + 1}`
          : null,
      })),
      preservedFiles: mapSources
        .map((source, sourceIndex) => `${agency.agencyId}-${sourceIndex + 1}`)
        .filter(file => fs.existsSync(`${preservedMapDirectory}/${file}`)),
      definitions: [],
      representativeThresholdMinutes: null,
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
    };
  });

audit.auditVersion = 2;
audit.scope = 'First 100 agencies in catalog order; official system-map evidence first, with approved official rider-facing definitions when the map is insufficient.';
audit.selectionRules = [
  'Record every named frequent/high-frequency tier discovered for an agency.',
  'Use the general, ordinary frequent/high-frequency tier as the representative definition for aggregate chart counts.',
  'Do not choose an express, peak-only, or exceptional fastest tier merely because it has the lowest number.',
  'If no representative tier can be selected without interpretation, preserve all definitions and leave the representative threshold null.',
];
audit.evidenceRules = [
  'Official current system maps and map legends are preferred evidence.',
  'An official rider-facing agency website or service-definition page may be used when the map is unavailable or insufficient; record the source type explicitly.',
  'Planning documents, route pages, schedules, and generic service bands are supplementary only unless explicitly approved as the agency definition source.',
  'Record the exact wording and page/section location; do not paraphrase a definition into existence.',
  'Preserve a local PDF/image when legally and technically practical; otherwise preserve the official URL and retrieval date.',
  'A missing definition is a valid result and must not be converted into a numeric definition.',
];
audit.records.push(...nextRecords);

fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Extended ${auditPath} to ${audit.records.length} records; added ${nextRecords.length} batch-two records.`);
