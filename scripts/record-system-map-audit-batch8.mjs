import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['ratp-paris', 'RATP Paris', 'France', 'Île-de-France', 'no_definition_on_map', 'system_map', 'https://www.ratp.fr/informer/picts/plans/pdf/reseaux/bus_paris.pdf', '2026 Paris bus map, Fonctionnement legend', null, null, null, 'Current 2026 RATP bus map visually reviewed. It describes operating days but does not name or define frequent/high-frequency service.'],
  ['tmb-barcelona', 'Transports Metropolitans de Barcelona', 'Spain', 'Catalonia', 'no_definition_on_map', 'system_map', 'https://static-web.tmb.cat/en/barcelona-transport/metro-bus-map', 'current metro and bus network maps', null, null, null, 'Current TMB metro and bus network maps visually reviewed. Neither names or defines frequent/high-frequency service.'],
  ['hsl-helsinki', 'HSL Helsinki', 'Finland', 'Uusimaa', 'no_definition_on_map', 'rider_guide', 'https://www.hsl.fi/en/hsl/trunk-route-network', 'Trunk route network rider material', 'frequent services; frequent headways; metro-like service with frequent headways', null, null, 'Current HSL trunk-route rider material uses “frequent” descriptively but gives no numeric definition.'],
  ['sl-stockholm', 'SL Stockholm', 'Sweden', 'Stockholm County', 'no_definition_on_map', 'rider_guide', 'https://sl.se/reseplanering/var-trafik/tunnelbanan', 'metro rider guide', 'Tunnelbanan går ofta; at weekends the metro runs around the clock', null, null, 'Current SL metro rider guide uses “often/frequently” descriptively but gives no headway definition.'],
  ['nx-west-midlands', 'NX West Midlands', 'United Kingdom', 'West Midlands', 'no_definition_on_map', 'rider_guide', 'https://nxbus.co.uk/west-midlands/places-to-go/birmingham-city-centre', 'Birmingham rider page', 'fast, frequent local travel', null, null, 'Current NX rider material uses “frequent” descriptively but gives no threshold or complete service-span definition.'],
  ['ptv-melbourne', 'Public Transport Victoria', 'Australia', 'Victoria', 'numeric_definition_on_map', 'rider_guide', 'https://www.ptv.vic.gov.au/assets/default-site/footer/about-ptv/improvements-and-projects/bus-and-coach/buses-return-to-grattan-street/PRT-Route-401.pdf', 'page 1 Route 401 rider guide', 'Limited-stop, high-frequency service running every 2–3 minutes during peak times; 4–6 minute peak frequency on non-university days.', 6, '2–3 minutes during peak times; 4–6 minutes on non-university days', 'Official PTV Route 401 rider guide visually reviewed. The named high-frequency category and both published headway bands are retained.'],
  ['taipei-metro', 'Taipei Metro', 'Taiwan', 'Taipei', 'no_definition_on_map', 'rider_guide', 'https://web.metro.taipei/QRCode/TaipeiMetroGuides/TaipeiMetroGuide_English.pdf?t=20211009', 'page 1 Operation Information', 'Headway; peak, off-peak, after 23:00', null, null, 'Official Taipei Metro guide visually reviewed. It publishes headways but does not name a frequent/high-frequency category.'],
  ['smrt-singapore', 'SMRT Singapore', 'Singapore', 'Singapore', 'no_definition_on_map', 'system_map', 'https://journey.smrt.com.sg/static/journey/js/helpers/data/network_map_2022_April.pdf', 'system-map legend and official rail guidance', 'Train frequency is 2 to 3 minutes during peak and about 5 to 7 minutes off-peak.', null, null, 'Official SMRT map and rail guidance reviewed. They publish intervals but do not define a named frequent/high-frequency category.'],
  ['sbs-transit-singapore', 'SBS Transit', 'Singapore', 'Singapore', 'no_definition_on_map', 'system_map', 'https://www.sbstransit.com.sg/system-map', 'current system-map legend', null, null, null, 'Current SBS Transit system map visually reviewed. It contains no named frequent/high-frequency category or threshold.'],
  ['seoul-metro', 'Seoul Metro', 'South Korea', 'Seoul', 'no_definition_on_map', 'system_map', 'https://english.seoul.go.kr/policy/transportation/modes-of-transport/subway-map-eng-2500/', 'map legend', null, null, null, 'Current Seoul Metro map visually reviewed. It identifies lines, stations, and transfers but no named frequent/high-frequency definition.'],
  ['anchorage-people-mover', 'Anchorage People Mover', 'United States', 'Alaska', 'numeric_definition_on_map', 'system_map', 'https://www.muni.org/Departments/transit/PeopleMover/Documents/%212025%20Documents/May%20Service%20Change/System%20Map.pdf', 'page 1 legend', 'Frequent Routes — 15 min peak frequency', 15, '15-minute peak frequency', 'Official Anchorage Transit Map, effective May 12, 2025, visually reviewed.'],
  ['ccta-green-mountain', 'CCTA / Green Mountain Transit', 'United States', 'Vermont', 'no_definition_on_map', 'rider_guide', 'https://ridegmt.com/wp-content/uploads/August-2026_Burlington.pdf', 'cover and route-map/guide pages', null, null, null, 'Current August 2026 Chittenden County bus map and guide visually reviewed. It lists routes and schedules but no frequent/high-frequency definition.'],
  ['mountain-transit-big-bear', 'Mountain Transit', 'United States', 'California', 'no_definition_on_map', 'rider_guide', 'https://www.mountaintransit.org/routes/big-bear-red-line/', 'Big Bear Red Line route guide', 'The Red Line Trolley runs on a loop', null, null, 'Current Big Bear Red Line rider material visually reviewed. It describes the loop and schedule but does not name or define frequent service.'],
  ['kingston-transit', 'Kingston Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://media-001-ca.cdn.govstack.com/cityofkingston-002-ca/media/1vdljvax/kingstontransit_systemmap_jan2026.pdf', 'page 1 system map', null, null, null, 'Current January 2026 Kingston Transit system map visually reviewed. It shows routes but no named frequent/high-frequency definition.'],
];

const existing = new Set(audit.records.map(record => record.agencyId));
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, rep, thresholdText, notes] of reviews) {
  if (existing.has(agencyId)) throw new Error(`Duplicate audit agency: ${agencyId}`);
  const qualifies = status === 'numeric_definition_on_map' || status === 'qualitative_definition_on_map';
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [{ url, sourceType, localFile: null }], preservedFiles: [], mapDate: null,
    mapPageOrSection: section, exactMapWording: exact, thresholdMinutes: rep, thresholdText,
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 8,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }],
    definitions: qualifies ? [{ id: 'primary', label: exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: rep, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: rep, publishedFrequencyBands: null,
  });
}

audit.scope = 'First 50 agencies plus 106 additional agencies reviewed individually against current official system maps or approved rider guides on September 18, 2026.';
audit.updatedAt = '2026-09-18';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${reviews.length} additional manual reviews.`);
