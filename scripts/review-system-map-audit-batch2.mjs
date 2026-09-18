import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = {
  cornwall: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources. Planning and route pages were retained as leads only; no frequent definition was inferred.' },
  drt: { status: 'numeric_definition_on_official_page', sourceType: 'official_service_guidelines', sourceUrl: 'https://www.durhamregiontransit.com/travelling-with-us/service-guidelines/', exact: 'Frequent Corridors: every 15 minutes or better during peak periods and every 20 minutes or better during other periods.', definitions: [{ id: 'frequent-corridor', label: 'Frequent Corridors', thresholdMinutes: 15, thresholdText: 'every 15 minutes or better during peak periods', representative: true }, { id: 'frequent-corridor-offpeak', label: 'Frequent Corridors', thresholdMinutes: 20, thresholdText: 'every 20 minutes or better during other periods', representative: false }], representative: 15, notes: 'Official current service-guidelines page; current map PDF URL in the catalog returned 404.' },
  go: { status: 'no_definition_on_map', sourceUrl: 'https://assets.metrolinx.com/image/upload/Documents/GO/system-map.pdf', localFile: 'go-2', mapSection: 'page 1, legend', exact: 'Regular service; limited service; Union Pearson Express operates every 15 minutes', notes: 'The official regional transit diagram was preserved and reviewed. It identifies service types and UP Express frequency but does not name a general frequent/high-frequency tier.' },
  grt: { status: 'numeric_definition_on_official_page', sourceType: 'official_frequent_network_page', sourceUrl: 'https://www.grt.ca/about-grt/plans-and-projects/grt-business-plan/', exact: 'Frequent transit network: service every 10 minutes on weekdays from 7 a.m.–7 p.m., and every 15 minutes all other times.', definitions: [{ id: 'ftn-weekday', label: 'Frequent transit network', thresholdMinutes: 10, thresholdText: 'every 10 minutes on weekdays from 7 a.m.–7 p.m.', representative: true }, { id: 'ftn-other', label: 'Frequent transit network', thresholdMinutes: 15, thresholdText: 'every 15 minutes all other times', representative: false }], representative: 10, notes: 'Official current business-plan page publishes the proposed frequent-network tiers; no current map threshold was used.' },
  sudbury: { status: 'numeric_definition_on_official_page', sourceType: 'official_frequent_network_page', sourceUrl: 'https://www.greatersudbury.ca/live/transit/transit-action-plan/connector-routes/', exact: 'Frequent routes initially offer service every 15 minutes at peak commuter times.', definitions: [{ id: 'frequent-peak', label: 'Frequent', thresholdMinutes: 15, thresholdText: 'every 15 minutes at peak commuter times', representative: true }], representative: 15, notes: 'Official transit-action-plan page names Frequent routes and gives their initial peak frequency.' },
  guelph: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources. Service pages and planning documents were not treated as map evidence.' },
  hamilton: { status: 'qualitative_definition_on_official_page', sourceType: 'official_network_page', sourceUrl: 'https://www.hamilton.ca/home-neighbourhood/hsr/hsr-next', exact: 'Express routes, called BLASTx, offer fast, direct trips between major hubs with fewer stops and frequent service.', definitions: [{ id: 'blastx', label: 'frequent service', thresholdMinutes: null, thresholdText: null, representative: true }], notes: 'The official HSR Next page uses frequent service qualitatively for express routes but does not publish a general numeric frequent threshold.' },
  kingston: { status: 'numeric_definition_on_official_page', sourceType: 'official_service_guidelines', sourceUrl: 'https://getinvolved.cityofkingston.ca/kingston-transit-service-standards/news_feed/draft-service-guidelines-spring-2026', exact: 'Frequent: 15 minutes during weekday peaks, 20 minutes at other weekday times and all weekend periods.', definitions: [{ id: 'frequent-peak', label: 'Frequent', thresholdMinutes: 15, thresholdText: '15 during weekday peaks', representative: true }, { id: 'frequent-other', label: 'Frequent', thresholdMinutes: 20, thresholdText: '20 at other weekday times and all weekend periods', representative: false }], representative: 15, notes: 'Official current service-review page defines the Frequent classification and its daypart thresholds.' },
  london: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources. Older route assessments were excluded from the representative definition.' },
  milton: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources. Transit master-plan material was retained as context only.' },
  niagara: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources. Strategy documents were not treated as a current rider-facing definition.' },
  'north-bay': { status: 'no_definition_on_map', sourceUrl: 'https://northbay.ca/services-payments/north-bay-transit/system-map/', localFile: 'north-bay-1', mapSection: 'official system-map page', exact: null, notes: 'The official system-map page was preserved and reviewed; it shows routes and service information but no named frequent/high-frequency definition.' },
  oakville: { status: 'numeric_definition_on_official_page', sourceType: 'official_service_update', sourceUrl: 'https://www.oakvilletransit.ca/riding-with-us/service-updates/2025-service-updates-archive/oakville-transit-expands-service-on-key-routes-effective-june-29-2025/', exact: 'Future Frequent Transit Network: 15 minutes during rush hour and 20 minutes outside rush hour.', definitions: [{ id: 'ftn-peak', label: 'Frequent Transit Network', thresholdMinutes: 15, thresholdText: '15 minutes during rush hour', representative: true }, { id: 'ftn-other', label: 'Frequent Transit Network', thresholdMinutes: 20, thresholdText: '20 minutes outside rush hour', representative: false }], representative: 15, notes: 'Official agency service-update page names the future FTN and publishes its two service periods.' },
  orangeville: { status: 'no_definition_on_map', sourceUrl: 'https://www.orangeville.ca/en/living-here/resources/Documents/Transit/SCHEDULES-Website_2026.pdf', localFile: 'orangeville-1', mapSection: 'route/schedule map PDF', exact: null, notes: 'The preserved official route/schedule PDF was reviewed; no named frequent/high-frequency definition was found.' },
  orillia: { status: 'map_unavailable', notes: 'The catalogued current map URL returned 404 and no replacement official system map was verified during review.' },
  'owen-sound': { status: 'no_definition_on_official_page', sourceType: 'official_route_service_page', sourceUrl: 'https://www.owensound.ca/living-here/public-transit/city-bus-service/', exact: 'All four routes provide half-hour service from 6:30 a.m. to 6:00 p.m.', definitions: [], notes: 'The official rider page publishes ordinary service frequency but does not name a frequent/high-frequency definition.' },
  'chatham-kent': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources; route and operating pages do not establish a named frequent definition.' },
  sarnia: { status: 'no_definition_on_map', sourceUrl: 'https://www.sarnia.ca/app/uploads/2023/03/Sarnia-Tranist-Map-and-Schedule-Effective-March-19-2023.pdf', localFile: 'sarnia-1', mapSection: 'map and schedule PDF', exact: null, notes: 'The preserved official map and schedule were reviewed; they show route frequencies but do not name a frequent/high-frequency category.' },
  simcoe: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  'st-thomas': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  stratford: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources; transportation-plan maps were excluded.' },
  'thunder-bay': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  timmins: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  windsor: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  upexpress: { status: 'map_unavailable', notes: 'No current standalone UP Express system map was verified; the service is shown within GO materials and was not assigned a separate frequent definition.' },
  't3-transit': { status: 'no_definition_on_map', sourceUrl: 'https://www.t3transit.ca/routes?lang=en', localFile: 't3-transit-2', mapSection: 'official route map', exact: null, notes: 'The official route-map page/PDF was preserved and reviewed; no named frequent/high-frequency definition was found.' },
  'exo-presquile': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  'exo-laurentides': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  'exo-lrrs': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  'exo-sudouest': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  'exo-terrebonne': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  exo: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  linter: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  'mont-tremblant': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  rem: { status: 'map_unavailable', notes: 'No current standalone REM system map was verified in the reviewed official sources.' },
  rtc: { status: 'map_unavailable', notes: 'The catalogued current RTC map URL returned 404 and no replacement official system map was verified during review.' },
  rtl: { status: 'no_definition_on_map', sourceUrl: 'https://old.rtl-longueuil.qc.ca/CMS/MediaFree/file/Carte%20reseau/9906_Carte_RTL_v2024-07-23-compressed.pdf', localFile: 'rtl-1', mapSection: 'network map legend', exact: null, notes: 'The preserved official RTL network map was reviewed; it does not name a frequent/high-frequency category.' },
  sjsr: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  sherbrooke: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  stl: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  stlevis: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  sto: { status: 'no_definition_on_map', sourceUrl: 'https://www.sto.ca/site/assets/files/2130/carte_reseau.pdf', localFile: 'sto-1', mapSection: 'network map legend', exact: null, notes: 'The preserved official STO network map was reviewed; it does not name a frequent/high-frequency category.' },
  'saint-hyacinthe': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  'moose-jaw': { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  'prince-albert': { status: 'no_definition_on_map', sourceUrl: 'https://www.citypa.ca/media/w1ela4xz/2024-10-21-transit-map.pdf', localFile: 'prince-albert-1', mapSection: 'network map legend', exact: null, notes: 'The preserved official Prince Albert transit map was reviewed; it does not name a frequent/high-frequency category.' },
  regina: { status: 'no_definition_on_map', sourceUrl: 'https://www.regina.ca/export/sites/Regina.ca/transportation-roads-parking/transit/.galleries/Transit-Route-PDF/Transit-System-Map-2024-March.pdf', localFile: 'regina-1', mapSection: 'system map legend', exact: null, notes: 'The preserved official Regina system map was reviewed; it does not name a frequent/high-frequency category.' },
  saskatoon: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources; service standards were not treated as map evidence.' },
  whitehorse: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources.' },
  guadalajara: { status: 'map_unavailable', notes: 'No current official system map was located in the reviewed official sources during this review.' },
  anchorage: { status: 'map_unavailable', notes: 'The catalogued official ride-guide PDF returned 404 and no replacement current system map was verified during review.' },
};

function sourceFor(review, record) {
  if (review.sourceUrl) return { url: review.sourceUrl, sourceType: review.sourceType ?? 'system_map', localFile: review.localFile ?? null };
  return record.mapCandidates?.[0] ?? null;
}

for (const record of audit.records.filter(record => record.reviewBatch === 2)) {
  const review = reviews[record.agencyId];
  if (!review) throw new Error(`Missing review for ${record.agencyId}`);
  const source = sourceFor(review, record);
  record.status = review.status;
  record.evidenceSourceType = review.sourceType ?? (source?.sourceType ?? null);
  record.reviewSources = source ? [{ url: source.url, sourceType: record.evidenceSourceType, localFile: source.localFile ?? null }] : [];
  record.preservedFiles = [...new Set([...(record.preservedFiles ?? []), ...(review.localFile ? [review.localFile] : [])])];
  record.mapPageOrSection = review.mapSection ?? record.mapPageOrSection ?? null;
  record.exactMapWording = review.exact ?? null;
  record.evidenceNotes = review.notes;
  record.definitions = (review.definitions ?? []).map(definition => ({
    ...definition,
    sourceType: record.evidenceSourceType,
    sourceUrl: source?.url ?? null,
    localFile: source?.localFile ?? null,
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

const trimet = audit.records.find(record => record.agencyId === 'trimet');
if (trimet) {
  trimet.representativeThresholdMinutes = 15;
  trimet.thresholdMinutes = 15;
  trimet.thresholdText = 'about every 15 minutes or less most of the day, every day';
  trimet.definitions = [
    { id: 'regular-frequent', label: 'Frequent Service', thresholdMinutes: 15, thresholdText: 'about every 15 minutes or less most of the day, every day', representative: true, sourceType: 'system_map', sourceUrl: 'https://www.trimet.org/maps/pdf/frequentservice.pdf', localFile: 'trimet-1', mapPageOrSection: 'page 1, service legend', exactWording: 'Frequent Service — About every 15 minutes or less most of the day, every day' },
    { id: 'frequent-express', label: 'FX Frequent Express Service', thresholdMinutes: 12, thresholdText: 'about every 12 minutes or less most of the day, every day', representative: false, sourceType: 'system_map', sourceUrl: 'https://www.trimet.org/maps/pdf/frequentservice.pdf', localFile: 'trimet-1', mapPageOrSection: 'page 1, service legend', exactWording: 'FX Frequent Express Service — About every 12 minutes or less most of the day, every day' },
    { id: 'rail', label: 'Rail Service', thresholdMinutes: 15, thresholdText: 'about every 15 minutes or less most of the day, every day', representative: false, sourceType: 'system_map', sourceUrl: 'https://www.trimet.org/maps/pdf/frequentservice.pdf', localFile: 'trimet-1', mapPageOrSection: 'page 1, service legend', exactWording: 'Rail Service — About every 15 minutes or less most of the day, every day' },
  ];
  trimet.evidenceNotes = 'TriMet’s preserved official Frequent Service map publishes separate rail, regular Frequent Service, and FX Frequent Express tiers. The representative agency definition is regular Frequent Service at about 15 minutes or less; FX at about 12 minutes is retained as a secondary tier.';
}

audit.statusRules.numeric_definition_on_official_page = 'An official rider-facing agency page names frequent/high-frequency service and gives a numeric threshold or range when the current map is unavailable or insufficient.';
audit.statusRules.qualitative_definition_on_official_page = 'An official rider-facing agency page names frequent/high-frequency service without a numeric threshold when the current map is unavailable or insufficient.';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log('Completed reviews for batch two:', Object.keys(reviews).length);
