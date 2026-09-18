import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const catalog = JSON.parse(fs.readFileSync('docs/research/frequent-service-catalog.json', 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = {
  asheville: {
    status: 'qualitative_definition_on_map', sourceType: 'system_map',
    sourceUrl: 'https://beta.ashevillenc.gov/wp-content/uploads/2018/10/SystemBrochure_2018_Back.pdf', localFile: 'asheville-1', mapSection: 'map legend',
    exact: 'Use buses along the frequent service corridors.',
    definitions: [{ id: 'frequent-corridors', label: 'frequent service corridors', thresholdMinutes: null, thresholdText: null, representative: true }],
    notes: 'The preserved official Asheville Frequent Service Map names frequent service corridors but does not publish a numeric threshold. The map is dated 2018 and is retained as historical evidence rather than presented as a current service promise.',
  },
  bangor: {
    status: 'no_definition_on_map', sourceType: 'system_map',
    sourceUrl: 'https://www.bangormaine.gov/DocumentCenter/View/3842/LargeScaleMap---NoSatService---Updated-July-2025-pdf', localFile: 'bangor-1', mapSection: 'route map and schedule PDF',
    exact: null,
    notes: 'The current official Bangor Community Connector route/schedule PDF was preserved and reviewed. It shows routes and schedules but does not name a frequent/high-frequency definition.',
  },
  'bis-man': {
    status: 'no_definition_on_map', sourceType: 'system_map',
    sourceUrl: 'https://bismantransit.com/files/2024/02/1.2024_BMT_Rider_Guide_web.pdf', localFile: 'bis-man-1', mapSection: 'rider guide route maps',
    exact: null,
    notes: 'The preserved official Bis-Man Transit rider guide contains route maps and schedule information but does not name a frequent/high-frequency definition.',
  },
  capmetro: {
    status: 'numeric_definition_on_map', sourceType: 'system_map',
    sourceUrl: 'https://www.capmetro.org/ride/plan/schedmap', mapSection: 'High-Frequency Network section',
    exact: 'Our High-Frequency Network gets you around all of Austin - north, south, east & west! The network has 14 routes that operate every 15-30 minutes.',
    definitions: [{ id: 'high-frequency-network', label: 'High-Frequency Network', thresholdMinutes: 30, thresholdText: 'every 15–30 minutes', representative: true }],
    representative: 30,
    notes: 'The official CapMetro system-map page names the High-Frequency Network and publishes a 15–30 minute range. The slowest ordinary period, 30 minutes, is used as the representative chart value while the full range is retained.',
  },
  abqride: {
    status: 'numeric_definition_on_official_page', sourceType: 'official_frequent_network_page',
    sourceUrl: 'https://www.cabq.gov/transit/services/about-albuquerque-rapid-transit', mapSection: 'ART service description',
    exact: 'Frequent all-day service. Buses arrive approximately every 20-30 minutes.',
    definitions: [{ id: 'art-frequent', label: 'Frequent all-day service', thresholdMinutes: 30, thresholdText: 'approximately every 20–30 minutes', representative: true }],
    representative: 30,
    notes: 'The official ABQ RIDE ART page names frequent all-day service and gives an approximate 20–30 minute range. The page is recorded as official rider-facing evidence because a current system-map definition was not verified.',
  },
};

for (const record of audit.records.filter(record => record.reviewBatch === 4)) {
  const review = reviews[record.agencyId] ?? {
    status: 'map_unavailable',
    notes: 'The catalogued official sources were checked as leads. No current official system map with a named frequent/high-frequency definition was verified; schedules, route pages, planning documents, and generic service bands were not used to infer one.',
  };
  const candidate = record.mapCandidates?.[0] ?? null;
  const catalogAgency = catalog.agencies.find(agency => agency.agencyId === record.agencyId);
  const leadSource = catalogAgency?.sources?.[0] ?? null;
  const sourceUrl = review.sourceUrl ?? candidate?.url ?? leadSource?.url ?? null;
  const sourceType = review.sourceType ?? candidate?.sourceType ?? leadSource?.type ?? null;
  const localFile = review.localFile ?? candidate?.localFile ?? null;
  record.status = review.status;
  record.evidenceSourceType = sourceType;
  record.reviewSources = sourceUrl ? [{ url: sourceUrl, sourceType, localFile }] : [];
  record.preservedFiles = [...new Set([...(record.preservedFiles ?? []), ...(review.localFile ? [review.localFile] : [])])];
  record.mapPageOrSection = review.mapSection ?? null;
  record.exactMapWording = review.exact ?? null;
  record.evidenceNotes = review.notes;
  record.definitions = (review.definitions ?? []).map(definition => ({
    ...definition, sourceType, sourceUrl, localFile, mapPageOrSection: record.mapPageOrSection,
    exactWording: review.exact ?? null, evidenceNotes: review.notes,
  }));
  record.representativeThresholdMinutes = review.representative ?? null;
  record.thresholdMinutes = review.representative ?? null;
  record.thresholdText = review.definitions?.find(definition => definition.representative)?.thresholdText ?? null;
  record.serviceSpan = null; record.days = null; record.geography = null; record.mode = null;
}

fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Completed reviews for batch four: ${audit.records.filter(record => record.reviewBatch === 4).length}`);
