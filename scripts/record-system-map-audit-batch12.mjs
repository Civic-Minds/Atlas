import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['grand-river-transit', 'Grand River Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://www.grt.ca/schedules-and-maps/maps/', 'PDF system map, effective September 7, 2026', 'The system map includes ION light rail and all GRT bus routes.', null, null, 'Official Grand River Transit system-map page visually reviewed. It shows the network but no named frequent-service definition.'],
  ['guelph-transit', 'Guelph Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://guelph.ca/wp-content/uploads/GuelphTransit_SystemMap_2026_09_061.pdf', 'page 1 system map', null, null, null, 'Official 2026 Guelph Transit system map visually reviewed. It shows routes but no named frequent/high-frequency definition.'],
  ['metrobus-st-johns', 'Metrobus', 'Canada', 'Newfoundland and Labrador', 'no_definition_on_map', 'system_map', 'https://metrobus.com/system_map.asp', 'Service at a glance / Fall-Winter System Map', 'View which routes service various key locations throughout our service area.', null, null, 'Official Metrobus system-map page visually reviewed. It provides network coverage information but no named frequent-service definition.'],
  ['brantford-transit', 'Brantford Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'rider_guide', 'https://www.brantford.ca/transportation/brantford-transit/transit-route-changes/', 'planned changes by route', 'Increased frequency will return this fall, with peak service every 20 minutes; Sunday service will operate every 45 minutes.', null, null, 'Official Brantford Transit route-change rider material visually reviewed. It gives route-specific intervals but does not define a named frequent-service category.'],
  ['stl-laval', 'Société de transport de Laval', 'Canada', 'Quebec', 'no_definition_on_map', 'system_map', 'https://stlaval.ca/en/schedule/bus', 'Bus Schedules / complete network map', 'View next trips in real time, full schedules, routes, current network alerts, and connections.', null, null, 'Official STL network-map and schedule page visually reviewed. It provides network and schedule access but no named frequent-service definition.'],
  ['septa', 'SEPTA', 'United States', 'Pennsylvania', 'numeric_definition_on_map', 'rider_guide', 'https://www.septa.org/initiatives/bus/maps-signs/', 'Frequent Red map guidance', 'Frequent Red routes run every 15 minutes or better from 6 am to 9 pm weekdays, with enhanced weekend service.', 15, 'every 15 minutes or better, 6 a.m.–9 p.m. weekdays', 'Official SEPTA bus-map guidance visually reviewed. It explicitly names Frequent Red routes and publishes the weekday threshold and span.'],
  ['thebus-honolulu', 'TheBus Honolulu', 'United States', 'Hawaii', 'numeric_definition_on_map', 'rider_guide', 'https://thebus.org/SystemMap/SystemMap20251002.pdf', 'October 2025 Route Guide, Frequent Urban Routes', 'Frequent Urban Routes; Route A runs 10 minutes peak, 15 minutes midday, 20 minutes evening weekdays, and 20 minutes Saturday and Sunday daytime.', 20, 'Frequent Urban Routes with route-specific 10–20-minute bands', 'Official October 2025 Honolulu route guide visually reviewed. It names Frequent Urban Routes and publishes route-period intervals; 20 minutes is the slowest stated ordinary band.'],
  ['dash-alexandria', 'DASH Alexandria', 'United States', 'Virginia', 'numeric_definition_on_map', 'system_map', 'https://www.dashbus.com/newnetwork/', 'frequency map guidance', 'Frequent service is 15 minutes or less, 6am–7pm weekdays and 7am–6pm weekends.', 15, '15 minutes or less, 6 a.m.–7 p.m. weekdays and 7 a.m.–6 p.m. weekends', 'Official DASH frequent-service network guidance visually reviewed. It explicitly defines the threshold and weekday/weekend spans; the page identifies the network as FY2022, so the date caveat is retained.'],
  ['nfta-metro-buffalo', 'NFTA-Metro Buffalo', 'United States', 'New York', 'no_definition_on_map', 'system_map', 'https://metro.nfta.com/getting-around/system-maps', 'system maps overview', 'System maps cover Standard, Frequent, and Express fixed routes.', null, null, 'Official NFTA system-map page visually reviewed. It confirms a Frequent category but supplies no threshold, span, or day definition in the current map materials.'],
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
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 12,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }],
    definitions: qualifies ? [{ id: 'primary', label: exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: rep, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: rep, publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 161 additional agencies reviewed individually against current official system maps or approved rider guides on September 18, 2026.';
audit.updatedAt = '2026-09-18';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
