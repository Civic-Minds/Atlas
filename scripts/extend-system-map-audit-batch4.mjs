import fs from 'node:fs';

const catalogPath = 'docs/research/frequent-service-catalog.json';
const auditPath = 'docs/research/system-map-audit-2026-09.json';
const preservedMapDirectory = '/Users/ryan/Desktop/Data/System Maps/Atlas Frequent Service';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const existingIds = new Set(audit.records.map(record => record.agencyId));
const nextRecords = catalog.agencies.slice(150, 250)
  .filter(agency => !existingIds.has(agency.agencyId))
  .map((agency, index) => {
    const mapSources = agency.sources.filter(source => source.type === 'system_map' || source.type === 'frequent_network_page');
    return {
      auditOrder: audit.records.length + index + 1,
      reviewBatch: 4,
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
      preservedFiles: mapSources.map((source, sourceIndex) => `${agency.agencyId}-${sourceIndex + 1}`)
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
if (nextRecords.length !== 100) throw new Error(`Expected 100 new records, got ${nextRecords.length}`);
audit.auditVersion = 4;
audit.scope = 'First 250 agencies in catalog order; official system-map evidence first, with approved official rider-facing definitions when the map is insufficient.';
audit.records.push(...nextRecords);
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Extended ${auditPath} to ${audit.records.length} records; added ${nextRecords.length} batch-four records.`);
