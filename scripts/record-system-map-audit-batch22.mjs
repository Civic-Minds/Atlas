import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['airdrie-transit', 'Airdrie Transit', 'Canada', 'Alberta', 'no_definition_on_map', 'system_map', 'https://www.airdrie.ca/getDocument.cfm?ID=11572', 'September 2024 route map legend', 'To Airdrie Stops; To Calgary Stops; 900 to Airdrie; 900 to Calgary.', 'Official Airdrie Transit route map visually reviewed. It identifies routes and stops but no named frequent-service definition.'],
  ['st-albert-transit', 'St. Albert Transit', 'Canada', 'Alberta', 'no_definition_on_map', 'system_map', 'https://stalbert.ca/site/assets/files/7121/stat-rideguide-fall2025-fullweekdaymap-final.pdf', 'Fall 2025/Winter 2026 weekday map legend', 'Hospital; School; Service Route; Direction of Travel; Timing Point; St. Albert Transit Boundary.', 'Official St. Albert Transit map visually reviewed. It identifies routes and map symbols but no named frequent-service definition.'],
  ['leduc-transit', 'Leduc Transit', 'Canada', 'Alberta', 'no_definition_on_map', 'system_map', 'https://www.leduc.ca/wp-content/uploads/2025/02/Leduc-Transit-Nisku-Service-Map-Route-1-On-Demand.pdf', 'route map legend', 'Bus Stops; Transit Routes; ROUTE 1; ROUTE 10; 1 & 10.', 'Official Leduc Transit map visually reviewed. The map is dated November 2021 and has no named frequent-service definition.'],
  ['exo', 'exo', 'Canada', 'Quebec', 'no_definition_on_map', 'system_map', 'https://exo.quebec/Media/Default/pdf/planifier-trajet/train/carte-reseau-trains-de-banlieue.pdf', 'commuter-rail network map legend', 'Gare avec stationnement; Gare sans stationnement; Sur certains départs seulement.', 'Official exo commuter-rail map visually reviewed. It identifies stations and departure exceptions but no named frequent-service definition.'],
  ['sts-saguenay', 'Société de transport du Saguenay', 'Canada', 'Quebec', 'no_definition_on_map', 'rider_guide', 'https://sts.saguenay.ca/files/documents/planifiez_vos_deplacements_encart.pdf', 'rider-planning guide', 'La carte interactive détaille chaque ligne du réseau et permet de connaître les horaires de passage à tous les arrêts.', 'Official STS rider-planning guide visually reviewed. It points riders to route and schedule tools but no named frequent-service definition.'],
  ['mta-nyc', 'New York City Transit / MTA', 'United States', 'New York', 'no_definition_on_map', 'system_map', 'https://www.mta.info/map/5341', 'August 2025 subway map legend', 'Normal service; Additional express service; Local service only; Part-time line extension; All trains stop.', 'Official MTA subway map visually reviewed. It identifies service patterns but no named frequent-service definition.'],
  ['nctd', 'North County Transit District', 'United States', 'California', 'no_definition_on_map', 'system_map', 'https://d4lp5oxce4dvw.cloudfront.net/wp-content/uploads/System-Map-Only-July-2026-WEB.pdf', 'July 2026 system map', 'COASTER STATIONS; SPRINTER STATIONS; station and zone tables.', 'Official NCTD system map visually reviewed. It shows stations and zones but no named frequent-service definition.'],
  ['caltrain', 'Caltrain', 'United States', 'California', 'no_definition_on_map', 'system_map', 'https://www.caltrain.com/media/36727/download', 'Exhibit 1, Caltrain System Map', 'ZONE 1 through ZONE 6 and station names.', 'Official Caltrain system map visually reviewed. It shows stations and zones but no named frequent-service definition.'],
  ['wave-wilmington', 'Wave Transit', 'United States', 'North Carolina', 'no_definition_on_map', 'system_map', 'https://www.wavetransit.com/wp-content/uploads/2025/01/Wave-Transit-System-Map_Jan25_printable-11x17-2.pdf', 'January 2025 system map legend', 'Bus Route; Transit Station; Landmark; Hospital; Interstate; US Highway; State Highway.', 'Official Wave Transit map visually reviewed. It identifies routes and landmarks but no named frequent-service definition.'],
  ['vre', 'Virginia Railway Express', 'United States', 'Virginia', 'no_definition_on_map', 'system_map', 'https://www.vre.org/service/system-map/', 'official system map and zone legend', 'System Map; Alexandria Station - Zone 2; Broad Run - Zone 6.', 'Official VRE system map visually reviewed. It identifies stations and zones but no named frequent-service definition.'],
];

const existing = new Set(audit.records.map(record => record.agencyId));
let inserted = 0;
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, notes] of reviews) {
  if (existing.has(agencyId)) continue;
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [{ url, sourceType, localFile: null }], preservedFiles: [], mapDate: null,
    mapPageOrSection: section, exactMapWording: exact, thresholdMinutes: null, thresholdText: null,
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 22,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }], definitions: [],
    representativeThresholdMinutes: null, publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 249 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
