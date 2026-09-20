import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['oakville-transit', 'Oakville Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://www.oakvilletransit.ca/getmedia/280bb767-50e9-4b50-8818-128a2eb2ba14/transit-system-map-september-2026.pdf', 'page 1 legend', 'Wider lines indicate more frequent service; 15 Minutes; 20 Minutes; 30 Minutes; 60 Minutes.', null, null, 'Official September 2026 Oakville Transit system map visually reviewed. It shows relative frequency and interval labels but no named frequent-service definition or span.'],
  ['milton-transit', 'Milton Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'rider_guide', 'https://www.milton.ca/en/living-in-milton/resources/Transit/Route-Schedules/IRM_Fall-2026/Milton_Transit_Ride_Guide_July2026-Proof2.pdf', 'page 1 legend', null, null, null, 'Official July 2026 Milton Transit rider guide visually reviewed. It shows routes and points of interest but no named frequent/high-frequency definition.'],
  ['niagara-region-transit', 'Niagara Region Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://nrtransit.ca/media/t2jpxu25/nrt-intermunicipal-route-map.pdf', 'page 1 intermunicipal route map', null, null, null, 'Official Niagara Region Transit map visually reviewed. It identifies routes, hubs, and connections but no named frequency category, threshold, or span.'],
  ['peterborough-transit', 'Peterborough Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://media-002-ca.cdn.govstack.com/memorialcentre-011-ca/media/t3xmvfja/regular-routes-2.pdf', 'page 1 Regular Routes map', 'Regular Routes; Night Route Indicator.', null, null, 'Official Peterborough Transit map visually reviewed. It identifies regular and night routes but no named frequent/high-frequency definition.'],
  ['strathcona-county-transit', 'Strathcona County Transit', 'Canada', 'Alberta', 'no_definition_on_map', 'system_map', 'https://storagecdn.strathcona.ca/files/files/trn-2026-local-map-effective-aug30.pdf', 'page 1 local map', 'LOCAL ROUTES.', null, null, 'Official Strathcona County map, effective August 30, 2026, visually reviewed. It identifies local routes but no named frequent/high-frequency category or threshold.'],
  ['metropolitano-lisboa', 'Metropolitano de Lisboa', 'Portugal', 'Lisbon', 'no_definition_on_map', 'system_map', 'https://www.metrolisboa.pt/wp-content/uploads/2026/01/DiagramadaRede_acessibilidades_2026_V22jan.pdf', 'one-page legend', null, null, null, 'Official 2026 Lisbon Metro network diagram visually reviewed. It identifies lines and accessibility symbols but no frequent-service definition.'],
  ['metro-madrid', 'Metro de Madrid', 'Spain', 'Madrid', 'no_definition_on_map', 'system_map', 'https://crtm.es/media/cdmlk0gq/serie_1a_planometro_mar2026.pdf', 'page 1 key/legend', 'Metro line; Light rail line.', null, null, 'Official March 2026 Madrid map visually reviewed. Mode labels are not a frequent-service definition.'],
  ['bkk-budapest', 'BKK Budapest', 'Hungary', 'Budapest', 'no_definition_on_map', 'rider_guide', 'https://bkk.hu/en/visiting-budapest/travel-options/', 'Daytime transport', 'Frequent metro trains, trams, trolleybuses and buses.', null, null, 'Official BKK rider guide visually reviewed. “Frequent” is generic descriptive prose with no named category or threshold.'],
  ['metro-bilbao', 'Metro Bilbao', 'Spain', 'Basque Country', 'no_definition_on_map', 'system_map', 'https://cms.metrobilbao.eus/sites/default/files/2025-03/METRO%20accesibilidad-cast_2.pdf', 'network-map section', null, null, null, 'Official Metro Bilbao network/accessibility map visually reviewed. It identifies routes, accessibility, and connections but no frequent-service definition.'],
  ['skm-warszawa', 'SKM Warszawa', 'Poland', 'Warsaw', 'no_definition_on_map', 'system_map', 'https://www.skm.warszawa.pl/en/information-for-passengers/maps/', 'SKM connection network scheme', null, null, null, 'Official current SKM Warszawa map visually reviewed. It shows routes, zones, and disruptions but no frequent-service definition.'],
  ['transport-nsw-sydney', 'Transport for NSW', 'Australia', 'New South Wales', 'numeric_definition_on_map', 'system_map', 'https://transportnsw.info/document/8045/Sydney-All-Day-Frequent-Network.pdf', 'page 1 legend, All Day Frequent Network', 'Frequent services operate daily, every 10 minutes or better during the day and every 20 minutes or better early morning and late evening.', 20, 'every 10 minutes or better during the day; every 20 minutes or better early morning and late evening', 'Official Sydney All Day Frequent Network map, effective June 21, 2026, visually reviewed. The slower ordinary period is retained as the representative value.'],
  ['auckland-transport', 'Auckland Transport', 'New Zealand', 'Auckland', 'no_definition_on_map', 'system_map', 'https://at.govt.nz/bus-train-ferry/at-mobile-app/network-maps', 'Rapid transit network map', 'Rapid transit network map; train and rapid bus services.', null, null, 'Official current Auckland network-map page visually reviewed. It identifies rapid transit but provides no frequency threshold or span.'],
  ['singapore-lta', 'Singapore LTA', 'Singapore', 'Singapore', 'no_definition_on_map', 'system_map', 'https://www.lta.gov.sg/content/dam/ltagov/getting_around/public_transport/rail_network/pdf/SM_EN_%28Ver210726%29_CCL6.pdf', '2026 rail system map legend', null, null, null, 'Official Singapore rail system map visually reviewed. It provides the network but no named frequent-service definition.'],
  ['transport-victoria-melbourne', 'Transport Victoria', 'Australia', 'Victoria', 'no_definition_on_map', 'system_map', 'https://transport.vic.gov.au/plan-a-journey/network-maps/melbourne-public-transport-maps', 'Metropolitan Melbourne public transport maps', 'This page includes regular and late-night public transport maps.', null, null, 'Official current Melbourne map page visually reviewed. It identifies regular and late-night maps but no frequent-service definition.'],
];

const existing = new Set(audit.records.map(record => record.agencyId));
let inserted = 0;
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, rep, thresholdText, notes] of reviews) {
  if (existing.has(agencyId)) continue;
  const qualifies = status === 'numeric_definition_on_map' || status === 'qualitative_definition_on_map';
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [{ url, sourceType, localFile: null }], preservedFiles: [], mapDate: null,
    mapPageOrSection: section, exactMapWording: exact, thresholdMinutes: rep, thresholdText,
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 13,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }],
    definitions: qualifies ? [{ id: 'primary', label: exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: rep, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: rep, publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 175 additional agencies reviewed individually against current official system maps or approved rider guides on September 18, 2026.';
audit.updatedAt = '2026-09-18';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
