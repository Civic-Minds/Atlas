import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['metro-west-yorkshire', 'West Yorkshire Metro', 'United Kingdom', 'West Yorkshire', 'numeric_definition_on_map', 'system_map', 'https://www.wymetro.com/media/9541/core-network-and-city-centre-screen-final.pdf', 'system map title/legend', 'every 15 mins or better', 15, 'every 15 mins or better', 'Mon–Sat daytime, evenings, and Sundays shown in frequency panel', null, 'Official Leeds Core Network map visually reviewed. Printed footer says correct at time of printing 2 April 2023.', 'Core Network'],
  ['tfwm-west-midlands', 'Transport for West Midlands', 'United Kingdom', 'West Midlands', 'numeric_definition_on_map', 'system_map', 'https://www.tfwm.org.uk/media/emthfzaq/solihull-area-map-20260104.pdf', 'system-map visual key', 'High frequency bus services (10 minutes or less daytime)', 10, '10 minutes or less daytime', 'daytime', null, 'Official Solihull area map visually reviewed.', 'High frequency bus services'],
  ['tfgm-greater-manchester', 'Transport for Greater Manchester / Bee Network', 'United Kingdom', 'Greater Manchester', 'numeric_definition_on_map', 'system_map', 'https://tfgm.com/maps', '12 minutes or less bus and tram map', '12 minutes or less bus and tram map; daytime buses and tram services that run every 12 minutes or less', 12, '12 minutes or less', 'daytime', null, 'Official TfGM high-frequency map page visually reviewed.', '12 minutes or less bus and tram services'],
  ['naolib-nantes', 'Naolib / Nantes Métropole', 'France', 'Pays de la Loire', 'numeric_definition_on_map', 'rider_guide', 'https://naolib.fr/fr/se-deplacer-la-nuit', 'approved rider guide, evening/night service section', 'Les lignes chronobus circulent avec une fréquence de 15 minutes; 30 minutes after 22:30.', 30, '15 minutes evening; 30 minutes after 22:30', '20:30–22:30 and later night periods', 'Monday–Sunday with later Friday/Saturday service', 'Official Naolib rider guide visually reviewed. The slowest published Chronobus period is used as representative.', 'Chronobus'],
  ['ilevia-lille', 'ilévia / Lille Métropole', 'France', 'Hauts-de-France', 'qualitative_definition_on_map', 'rider_guide', 'https://nouveaureseaubus.ilevia.fr/', '2026 network rider guide and official network map legend', '13 lignes à fréquence renforcée; LIANES URBAINES', null, null, null, null, 'Official ilévia rider guide/map visually reviewed. It names reinforced-frequency lines but publishes no class-wide number.', 'Lianes / reinforced-frequency lines'],
  ['newcastle-transport', 'Newcastle Transport', 'Australia', 'New South Wales', 'qualitative_definition_on_map', 'system_map', 'https://transportnsw.info/document/6095/22068_kdh_newcastle_network_map_web.pdf', 'map legend, effective 3 April 2022', 'Frequent bus route', null, null, null, null, 'Official Newcastle Transport network map visually reviewed. It names frequent bus routes but publishes no threshold.', 'Frequent bus route'],
  ['busways-central-coast', 'Busways Central Coast', 'Australia', 'New South Wales', 'no_definition_on_map', 'system_map', 'https://transportnsw.info/document/6484/Busways%20Central%20Coast%20Network%20Map.pdf', 'map legend, effective 23 March 2026', null, null, null, null, null, 'Official Busways Central Coast map visually reviewed. No named frequent-service definition.', null],
  ['tweed-transit', 'Tweed bus network', 'Australia', 'New South Wales', 'no_definition_on_map', 'system_map', 'https://transportnsw.info/document/8757/The-Tweed-Network-Map-June-2026.pdf', 'map legend, June 2026', null, null, null, null, null, 'Official Tweed network map visually reviewed. No named frequent-service definition.', null],
  ['coffs-harbour-bus', 'Coffs Harbour Busways', 'Australia', 'New South Wales', 'no_definition_on_map', 'system_map', 'https://transportnsw.info/document/6915/Coffs%20Harbour%20Bus%20Network.pdf', 'map legend', null, null, null, null, null, 'Official Coffs Harbour network map visually reviewed. No named frequent-service definition.', null],
  ['sunshine-coast-translink', 'Translink Sunshine Coast', 'Australia', 'Queensland', 'no_definition_on_map', 'system_map', 'https://translink.widen.net/s/qkbxpsx6gz/251213-sunshine-coast-network-map', 'key/map legend, effective December 2025', null, null, null, null, null, 'Official Sunshine Coast network map visually reviewed. No named frequent-service definition.', null],
  ['longbeach', 'Long Beach Transit', 'United States', 'California', 'qualitative_definition_on_map', 'system_map', 'https://ridelbt.com/wp-content/uploads/2025/02/LBT_SystemMap_Freestanding.pdf', 'page 1 map legend', 'Heavier lines indicate frequent service.', null, null, null, null, 'Official Long Beach Transit system map visually reviewed. It names frequent service but publishes no threshold.', 'Frequent service'],
  ['fax', 'Fresno Area Express', 'United States', 'California', 'numeric_definition_on_map', 'rider_guide', 'https://www.fresno.gov/wp-content/uploads/2026/01/COMPLETE-SCHEDULE-GUIDE-1-26-10w1248.pdf', 'PDF page 4, Route 9 map legend', '15 MINUTE FREQUENCY (Weekday from 6am to 6pm)', 15, '15 minute frequency', '6am–6pm', 'weekdays', 'Official FAX schedule guide/map visually reviewed.', '15 minute frequency'],
  ['bata', 'Bay Area Transportation Authority', 'United States', 'Michigan', 'no_definition_on_map', 'rider_guide', 'https://www.bata.net/userfiles/filemanager/3b85viywp8n2vjkvnup0/', 'page 1 Bayline frequency panel', 'Buses run about every', null, null, null, null, 'Official Bayline map/guide visually reviewed. It gives intervals but does not name frequent or high-frequency service.', null],
  ['marintransit', 'Marin Transit', 'United States', 'California', 'no_definition_on_map', 'system_map', 'https://marintransit.gov/sites/default/files/2026-09/Marin%20System%20Map_April%202026.pdf', 'page 1 upper-right legend', 'Marin Transit Local Routes; Marin Transit Community Shuttles; West Marin Stagecoach', null, null, null, null, 'Official Marin Transit system map visually reviewed. No named frequent-service definition.', null],
  ['connect-transit', 'Connect Transit', 'United States', 'Illinois', 'no_definition_on_map', 'rider_guide', 'https://connect-transit.com/file/4563/Rider%20Guide%2008-26.pdf', 'PDF page 4 Route Frequency table', '15 MINUTE FREQUENCY; 30 MINUTE FREQUENCY; 60 MINUTE FREQUENCY', null, null, null, null, 'Official Connect Transit rider guide visually reviewed. It gives generic route intervals but no named frequent/high-frequency network.', null],
];

const existing = new Set(audit.records.map(record => record.agencyId));
let inserted = 0;
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, threshold, thresholdText, serviceSpan, days, notes, label] of reviews) {
  if (existing.has(agencyId)) continue;
  const source = { url, sourceType, localFile: null };
  const numericOrQualitative = status === 'numeric_definition_on_map' || status === 'qualitative_definition_on_map';
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [source], preservedFiles: [], mapDate: null, mapPageOrSection: section,
    exactMapWording: exact, thresholdMinutes: threshold ?? null, thresholdText: thresholdText ?? null,
    serviceSpan: serviceSpan ?? null, days: days ?? null, geography: null, mode: null,
    evidenceNotes: notes, reviewBatch: 26, evidenceSourceType: sourceType, reviewSources: [source],
    definitions: numericOrQualitative ? [{ id: 'frequent', label: label ?? 'Frequent service', thresholdMinutes: threshold ?? null,
      thresholdText: thresholdText ?? null, representative: status === 'numeric_definition_on_map', sourceType,
      sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: status === 'numeric_definition_on_map' ? threshold : null,
    publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 283 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
