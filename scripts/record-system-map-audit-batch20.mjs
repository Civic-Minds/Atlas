import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['chilliwack-transit', 'Chilliwack Transit', 'Canada', 'British Columbia', 'no_definition_on_map', 'rider_guide', 'https://www.bctransit.com/chilliwack/wp-content/uploads/sites/10/2026/06/chw_rg_june2026.pdf', 'June 28, 2026 rider guide map', 'Limited Service.', null, null, 'Official Chilliwack rider guide visually reviewed. It shows routes and limited service but no named frequent/high-frequency definition.'],
  ['vernon-regional-transit', 'Vernon Regional Transit', 'Canada', 'British Columbia', 'numeric_definition_on_map', 'rider_guide', 'https://www.bctransit.com/vernon/wp-content/uploads/sites/53/2026/01/ver_rg_jan2026.pdf', 'January 4, 2026 rider guide, Route 97 Okanagan', 'Frequent weekday UBC Okanagan service to Downtown Kelowna — 6:30 am–6:30 pm 15 min; 6:30 pm–1:45 am 30 min.', 30, '15 minutes daytime and 30 minutes evening, weekdays', 'Official Vernon rider guide visually reviewed. The named frequent service is the regional Route 97 Okanagan, not the local Vernon routes; 30 minutes is the slowest stated ordinary band.'],
  ['quesnel-transit', 'Quesnel Transit', 'Canada', 'British Columbia', 'no_definition_on_map', 'rider_guide', 'https://www.bctransit.com/quesnel/wp-content/uploads/sites/32/2026/06/qnl_rg_june2026.pdf', 'June 29, 2026 rider guide map', 'Limited Service.', null, null, 'Official Quesnel rider guide visually reviewed. It lists routes and limited service but no named frequent/high-frequency definition.'],
  ['port-alberni-transit', 'Port Alberni Transit', 'Canada', 'British Columbia', 'no_definition_on_map', 'rider_guide', 'https://www.bctransit.com/port-alberni/wp-content/uploads/sites/35/2025/09/pal_rg_sept2025.pdf', 'September 2, 2025 rider guide map', null, null, null, 'Official Port Alberni rider guide visually reviewed. It identifies routes but no named frequent/high-frequency definition.'],
  ['powell-river-transit', 'Powell River Transit', 'Canada', 'British Columbia', 'no_definition_on_map', 'rider_guide', 'https://www.bctransit.com/powell-river/wp-content/uploads/sites/37/2026/09/pow_rg_sept2026.pdf', 'September 8, 2026 rider guide map', 'Fixed; Rural; Limited; OnDemand.', null, null, 'Official Powell River rider guide visually reviewed. It labels service types but no named frequent/high-frequency definition.'],
  ['cherriots', 'Cherriots', 'United States', 'Oregon', 'numeric_definition_on_map', 'system_map', 'https://www.cherriots.org/media/doc/cherriots-system-map-park-and-rides-2024-01-04.pdf', 'system map legend', 'Frequent service — 15 minutes during most of the day.', 15, '15-minute service during most of the day', 'Official Cherriots system map visually reviewed. It names frequent service and publishes the numeric threshold.'],
  ['the-comet-columbia', 'The COMET', 'United States', 'South Carolina', 'numeric_definition_on_map', 'system_map', 'https://catchthecometsc.gov/wp-content/uploads/2026/01/COMET-System-Map-INT-Jan2026-prf1.pdf', 'January 2026 map legend', 'Frequent Service (30 min. or less).', 30, '30 minutes or less', 'Official January 2026 COMET system map visually reviewed. It explicitly names Frequent Service and gives the threshold.'],
  ['ride-on-montgomery', 'Ride On', 'United States', 'Maryland', 'no_definition_on_map', 'system_map', 'https://assets.montgomerycountymd.gov/files/July_2025_System_Map.pdf', 'July 2025 system map', null, null, null, 'Official Ride On system map visually reviewed. It does not name or define a frequent/high-frequency category.'],
  ['hampton-roads-transit', 'Hampton Roads Transit', 'United States', 'Virginia', 'map_unavailable', 'system_map', 'https://gohrt.com/system-map/', 'current official system-map page', null, null, null, 'The current official system-map page did not expose a reviewable map payload; planning documents were excluded.'],
  ['cts-strasbourg', 'CTS Strasbourg', 'France', 'Grand Est', 'qualitative_definition_on_map', 'system_map', 'https://www.cts-strasbourg.eu/export/sites/default/.galleries/Documents/Plan-Detaille-reseau-CTS.pdf', 'network map, edition 11/2025', 'Fonctionnement de 4h30 à 0h30 … Dichte Taktfolge / High Frequency; + fréquent + fluide + facile; Amplitude et fréquence variables selon la ligne.', null, null, 'Official CTS network map visually reviewed. It names high-frequency service but gives no numeric threshold.'],
  ['lvb-leipzig', 'LVB Leipzig', 'Germany', 'Saxony', 'no_definition_on_map', 'system_map', 'https://files.l.de/lde-typo3/Leipziger/Verkehrsbetriebe/Fahrtinfos/Netzplan/2025-LVB-LNP-Tag-ab-141225.pdf', 'day network map valid December 14, 2025', null, null, null, 'Official LVB day network map visually reviewed. It shows routes and zones but no frequent-service definition.'],
  ['vbb-berlin-brandenburg', 'VBB Berlin–Brandenburg', 'Germany', 'Berlin-Brandenburg', 'no_definition_on_map', 'system_map', 'https://www.vbb.de/fileadmin/user_upload/VBB/Dokumente/Liniennetze/berlin-s-u-schnellbahn-tarifbereich-abc.pdf', 'S+U-Bahn map valid June 14, 2026', null, null, null, 'Official VBB map visually reviewed. It shows network, stations, and fare areas but no frequent-service definition.'],
  ['tallinn-public-transport', 'Tallinn Public Transport', 'Estonia', 'Tallinn', 'no_definition_on_map', 'rider_guide', 'https://web.visittallinn.ee/eng/visitor/plan/transport/public-transport', 'Tallinn Public Transport Map 2026', null, null, null, 'Approved Tallinn rider guide/map page visually reviewed. It identifies bus, trolleybus, and tram routes but no frequent-service definition.'],
  ['metro-sevilla', 'Metro de Sevilla', 'Spain', 'Andalusia', 'no_definition_on_map', 'system_map', 'https://www.metro-sevilla.es/mapa-y-trayectos', 'current map and legend', null, null, null, 'Official Metro de Sevilla map page visually reviewed. It shows lines, stations, connections, and accessibility symbols but no frequent-service definition.'],
  ['kochimetro', 'Kochi Metro Rail', 'India', 'Kerala', 'no_definition_on_map', 'system_map', 'https://corporate.kochimetro.org/the-project', 'integrated public transport map', 'Integrated Public Transport Map; station and interchange labels.', null, null, 'Official Kochi Metro map visually reviewed. It shows the integrated network but no frequent-service definition.'],
  ['nagpur-metro', 'Nagpur Metro', 'India', 'Maharashtra', 'no_definition_on_map', 'system_map', 'https://mahametro.org/route_maps.html', 'official route-map page', 'Alignment 1 North–South Corridor; Alignment 2 East–West Corridor.', null, null, 'Official Nagpur Metro route map visually reviewed. It shows corridors and stations but no frequent-service definition.'],
  ['pune-metro', 'Pune Metro', 'India', 'Maharashtra', 'no_definition_on_map', 'system_map', 'https://mahametro.org/route_maps.html', 'official route-map page', 'Line 1 PCMC–Swargate; Line 2 Vanaz–Ramwadi.', null, null, 'Official Pune Metro route map visually reviewed. It shows lines and stations but no frequent-service definition.'],
  ['dhaka-mrt-line-6', 'Dhaka MRT Line 6', 'Bangladesh', 'Dhaka', 'no_definition_on_map', 'system_map', 'https://dmtcl.gov.bd/pages/static-pages/6922ddb2933eb65569e15eb8', 'MRT Line-6 Route Map', 'MRT Line-6 Route Map; station list and interchange symbols.', null, null, 'Official DMTCL route map visually reviewed. It shows stations and the line network but no frequent-service definition.'],
  ['kolkata-metro', 'Metro Railway Kolkata', 'India', 'West Bengal', 'no_definition_on_map', 'system_map', 'https://mtp.indianrailways.gov.in/uploads/files/1709894160765-DMM%20MRK%202024.pdf', 'map page 4', 'MAP OF METRO RAILWAY, KOLKATA; Corridor Colours for Metro Network in Kolkata.', null, null, 'Official Indian Railways Kolkata Metro map visually reviewed. It shows corridors and line colors but no frequent-service definition.'],
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
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 20,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }],
    definitions: qualifies ? [{ id: 'primary', label: exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: rep, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: rep, publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 229 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
