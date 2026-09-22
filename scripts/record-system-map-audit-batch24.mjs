import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['smart', 'SMART Detroit', 'United States', 'Michigan', 'numeric_definition_on_map', 'rider_guide', 'https://www.smartbus.org/ridesmart-fast', 'FAST map and rider information', 'FAST: SMART’s Frequent, Limited-Stop Service; 15–20 minutes during peak hours; 7 days a week.', 20, '15–20 minutes during peak hours', null, '7 days/week', 'Official SMART FAST map/rider information visually reviewed. The slowest published frequent period is used as the representative threshold.', 'Frequent, Limited-Stop Service'],
  ['transport-victoria-melbourne', 'Transport Victoria Melbourne', 'Australia', 'Victoria', 'numeric_definition_on_map', 'system_map', 'https://edge.sitecorecloud.io/stategovernc45d-cftw-production-c9ca/media/Project/TransportWebsite/Forms/DTP2029_Rapid-Bus-Product_Digital_A3_North_FINAL.pdf', 'system map, page 1', 'Your local high frequency bus network; 20 minute frequency for most of the day.', 20, '20 minute frequency for most of the day', 'most of the day', null, 'Official Transport Victoria high-frequency map visually reviewed.', 'High frequency bus network'],
  ['hsl-helsinki', 'HSL Helsinki', 'Finland', 'Uusimaa', 'qualitative_definition_on_map', 'system_map', 'https://www.hsl.fi/en/hsl/trunk-route-network', 'current trunk-route map page and heading', 'Runkolinjat / Stomlinjenät / Trunk routes; a network of frequent services.', null, null, null, null, 'Official HSL trunk-route map page visually reviewed. It names a frequent-services network but publishes no threshold.', 'Trunk routes'],
  ['stib-brussels', 'STIB/MIVB Brussels', 'Belgium', 'Brussels', 'qualitative_definition_on_map', 'system_map', 'https://www.stib-mivb.be/files/live/sites/STIBMIVB/files/Travel/Plans%20r%C3%A9seau/SCHM_Plan_NEXT.pdf', 'map legend, lower-right corner', 'CHRONO; fréquences élevées / hoge frequentie / high frequencies.', null, null, null, null, 'Official STIB network map visually reviewed. It defines CHRONO as high-frequency but publishes no threshold.', 'CHRONO'],
  ['tcl-lyon', 'TCL Lyon', 'France', 'Auvergne-Rhône-Alpes', 'qualitative_definition_on_map', 'system_map', 'https://www.tcl.fr/sites/default/files/2026-08/Plan_des_lignes_fortes_TCL.pdf', 'map title/legend', 'Plan des lignes fortes; selected strong-line routes show 2 min, 3 min, and 6 min service.', null, null, 'weekdays for selected services', 'Official TCL strong-lines map visually reviewed. It names a strong-lines network but does not state one network-wide threshold.', 'Strong lines'],
  ['tmb-barcelona', 'TMB Barcelona', 'Spain', 'Catalonia', 'no_definition_on_map', 'system_map', 'https://static-web.tmb.cat/documents/20182/45206/Pl%C3%A0nol%2Bxarxa%2Bbus.pdf/9b5bfa95-6117-4117-9843-fb3e3fde5447?t=1720539219322', 'map legend and route presentation', null, null, null, null, null, 'Official TMB bus network map visually reviewed. No named frequent/high-frequency category appears on the map.', null],
  ['kcata', 'RideKC / KCATA', 'United States', 'Missouri/Kansas', 'map_unavailable', 'system_map', 'https://ridekc.org/assets/uploads/documents/SystemMap.pdf', 'map legend', 'Frequent Bus Service — 12–15 minutes; map effective January 1, 2018.', null, null, null, null, 'The available map is outdated and was excluded from current verified results; no current qualifying map artifact was located.', null],
  ['communitytransit', 'Community Transit', 'United States', 'Washington', 'no_definition_on_map', 'system_map', 'https://www.communitytransit.org/docs/default-source/mappdfs/systemmappdfs/mapsystem.pdf', 'system map legend, dated 06/26', 'Swift; Blue, Green, and Orange Lines.', null, null, null, null, 'Official Community Transit system map visually reviewed. It names Swift service but gives no explicit frequent-service definition.', null],
  ['gcrta', 'Greater Cleveland RTA', 'United States', 'Ohio', 'map_unavailable', 'system_map', 'https://www.riderta.com/systemmap', 'official interactive system-map page', null, null, null, null, null, 'The current official system-map page exposes an interactive map but no accessible current PDF/image legend; older frequency maps were planning documents and excluded.', null],
  ['cdta', 'Capital District Transportation Authority', 'United States', 'New York', 'map_unavailable', 'system_map', 'https://www.cdta.org/service-area-map', 'current service-area map page', 'The accessible PDF is labeled 2016–17 System Map & Rider Guide.', null, null, null, null, 'The current map page does not expose a current downloadable legend; the old PDF was excluded from current results.', null],
  ['metlink-wellington', 'Metlink Wellington', 'New Zealand', 'Wellington', 'no_definition_on_map', 'system_map', 'https://www.metlink.org.nz/assets/Network-maps/2026/Wellington-Region-Network-Map-July-2026.pdf', 'system map, page 1 legend', 'Wellington Core and Standard Bus Routes; Wellington Peak-Only Bus Routes.', null, null, null, null, 'Official Metlink regional network map visually reviewed. It names route classes but no frequent-service definition.', null],
  ['transperth', 'Transperth', 'Australia', 'Western Australia', 'no_definition_on_map', 'rider_guide', 'https://www.transperth.wa.gov.au/Portals/0/Asset/Documents/Brochures/Your%20Guide%20to%20Using%20Transperth.pdf', 'rider guide, page 7', 'CAT buses operate every five to 15 minutes depending on the route, time of day and day of the week.', null, null, null, null, 'Official Transperth rider guide visually reviewed. CAT intervals are generic service information, not a named frequent-service definition.', null],
  ['taipei-metro', 'Taipei Metro', 'Taiwan', 'Taipei', 'no_definition_on_map', 'rider_guide', 'https://web.metro.taipei/QRCode/TaipeiMetroGuides/TaipeiMetroGuide_English.pdf?t=20211009', 'rider guide, page 1 Operation Information', 'Headway; line-specific ranges such as Every 2~4 min and Every 3~7 min.', null, null, null, null, 'Official Taipei Metro rider guide visually reviewed. It gives line headways but no named frequent-service category.', null],
  ['smrt-singapore', 'SMRT Singapore', 'Singapore', 'Singapore', 'no_definition_on_map', 'system_map', 'https://journey.smrt.com.sg/static/journey/js/helpers/data/network_map_2022_April.pdf', 'system map, page 1', 'System Map; MRT/LRT line and interchange labels.', null, null, null, null, 'Official SMRT system map visually reviewed. It has no frequency threshold or named frequent-service category.', null],
];

const existing = new Set(audit.records.map(record => record.agencyId));
let inserted = 0;
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, threshold, thresholdText, serviceSpan, days, notes, label] of reviews) {
  if (existing.has(agencyId)) continue;
  const source = { url, sourceType, localFile: null };
  const definitions = status === 'numeric_definition_on_map' || status === 'qualitative_definition_on_map' ? [{
    id: 'frequent', label: label ?? 'Frequent service', thresholdMinutes: threshold,
    thresholdText, representative: status === 'numeric_definition_on_map', sourceType,
    sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes,
  }] : [];
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [source], preservedFiles: [], mapDate: null, mapPageOrSection: section,
    exactMapWording: exact, thresholdMinutes: threshold, thresholdText, serviceSpan: serviceSpan ?? null,
    days: days ?? null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 24,
    evidenceSourceType: sourceType, reviewSources: [source], definitions,
    representativeThresholdMinutes: status === 'numeric_definition_on_map' ? threshold : null,
    publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 274 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
