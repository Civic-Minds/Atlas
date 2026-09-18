import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const catalog = JSON.parse(fs.readFileSync('docs/research/frequent-service-catalog.json', 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = {
  valleymetro: {
    status: 'numeric_definition_on_map',
    sourceType: 'system_map',
    sourceUrl: 'https://vulcan-production.nyc3.cdn.digitaloceanspaces.com/pages/downloads/maps-schedules/system-map/25oct/2_val_msys_frequent_250912.pdf',
    localFile: 'valleymetro-1',
    mapSection: 'map legend',
    exact: 'Every 15 minutes or better from at least 6 a.m. to 6 p.m. on weekdays.',
    definitions: [{ id: 'frequent-weekday', label: 'Frequent Service', thresholdMinutes: 15, thresholdText: 'every 15 minutes or better from at least 6 a.m. to 6 p.m. on weekdays', representative: true }],
    representative: 15,
    notes: 'The preserved official Valley Metro Frequent Service Map names Frequent Service and states the weekday threshold. A second official system-map PDF was also checked for context; the dedicated frequent map was used as the representative source.',
  },
  longbeach: {
    status: 'qualitative_definition_on_map',
    sourceType: 'system_map',
    sourceUrl: 'https://ridelbt.com/wp-content/uploads/2025/02/LBT_SystemMap_Freestanding.pdf',
    localFile: 'longbeach-1',
    mapSection: 'map legend',
    exact: 'Heavier lines indicate frequent service. Lighter lines indicate less frequent service and route variations.',
    definitions: [{ id: 'frequent-lines', label: 'Frequent service', thresholdMinutes: null, thresholdText: null, representative: true }],
    notes: 'The preserved official Long Beach Transit system map distinguishes heavier lines as frequent service but does not publish a numeric threshold.',
  },
  marintransit: {
    status: 'no_definition_on_map',
    sourceType: 'system_map',
    sourceUrl: 'https://marintransit.gov/sites/default/files/2026-09/Marin%20System%20Map_April%202026.pdf',
    localFile: 'marintransit-1',
    mapSection: 'system map',
    exact: null,
    notes: 'The current official Marin Transit system map was preserved and reviewed. It shows the network but does not name a frequent/high-frequency definition.',
  },
  glendalebeeline: {
    status: 'no_definition_on_map',
    sourceType: 'system_map',
    sourceUrl: 'https://www.glendaletransit.com/tools/system-map/',
    mapSection: 'official system-map page',
    exact: null,
    notes: 'The official Glendale Beeline system-map page was reviewed. It provides the network map and route information but does not name a frequent/high-frequency definition.',
  },
  ycat: {
    status: 'map_unavailable',
    notes: 'The catalogued official system-map URL returned 404. The official route and rider pages were checked as leads, but no current official system map with a frequent definition was verified.',
  },
  fax: {
    status: 'map_unavailable',
    notes: 'The catalogued official schedule-guide PDF and service page were inaccessible during review. No current official system map with a frequent definition was verified.',
  },
  ladot: {
    status: 'map_unavailable',
    notes: 'The catalogued official DASH map and service page were blocked by the site during review. No current official system map with a frequent definition was verified.',
  },
  metrolink: {
    status: 'map_unavailable',
    notes: 'The official rider page was reviewed, but it did not expose a current system-map file that could be verified as a frequent-service definition. No numeric or qualitative frequent definition was inferred from schedules.',
  },
  bigbluebus: {
    status: 'numeric_definition_on_official_page',
    sourceType: 'official_frequent_network_page',
    sourceUrl: 'https://www.santamonica.gov/blog/big-blue-bus-provides-10-million-rides-for-the-second-consecutive-year',
    mapSection: 'service description',
    exact: 'More frequent service with the introduction of Big Blue Bus’s network of high-frequency routes, which offer service every 15 minutes or better most of the day.',
    definitions: [{ id: 'high-frequency', label: 'high-frequency routes', thresholdMinutes: 15, thresholdText: 'every 15 minutes or better most of the day', representative: true }],
    representative: 15,
    notes: 'The official City of Santa Monica rider-facing announcement names Big Blue Bus high-frequency routes and gives a numeric threshold. No current system-map threshold was verified, so the source is recorded as an official page rather than a map.',
  },
};

for (const record of audit.records.filter(record => record.reviewBatch === 3)) {
  const review = reviews[record.agencyId] ?? {
    status: 'map_unavailable',
    notes: 'The catalogued official sources were reviewed as leads. No current official system map with a named frequent/high-frequency definition was verified; schedules, route pages, and planning documents were not used to infer one.',
  };
  const candidate = record.mapCandidates?.[0] ?? null;
  const catalogAgency = catalog.agencies.find(agency => agency.agencyId === record.agencyId);
  const leadSource = catalogAgency?.sources?.[0] ?? null;
  const sourceUrl = review.sourceUrl ?? candidate?.url ?? leadSource?.url ?? null;
  const sourceType = review.sourceType ?? candidate?.sourceType ?? leadSource?.type ?? null;
  record.status = review.status;
  record.evidenceSourceType = sourceType;
  record.reviewSources = sourceUrl ? [{ url: sourceUrl, sourceType, localFile: review.localFile ?? candidate?.localFile ?? null }] : [];
  record.preservedFiles = [...new Set([...(record.preservedFiles ?? []), ...(review.localFile ? [review.localFile] : [])])];
  record.mapPageOrSection = review.mapSection ?? null;
  record.exactMapWording = review.exact ?? null;
  record.evidenceNotes = review.notes;
  record.definitions = (review.definitions ?? []).map(definition => ({
    ...definition,
    sourceType,
    sourceUrl,
    localFile: review.localFile ?? candidate?.localFile ?? null,
    mapPageOrSection: record.mapPageOrSection,
    exactWording: review.exact ?? null,
    evidenceNotes: review.notes,
  }));
  record.representativeThresholdMinutes = review.representative ?? null;
  record.thresholdMinutes = review.representative ?? null;
  record.thresholdText = review.definitions?.find(definition => definition.representative)?.thresholdText ?? null;
  record.serviceSpan = null;
  record.days = null;
  record.geography = null;
  record.mode = null;
}

fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Completed reviews for batch three: ${audit.records.filter(record => record.reviewBatch === 3).length}`);
