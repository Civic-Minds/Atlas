import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const existing = new Set(audit.records.map(record => record.agencyId));

const reviews = [
  ['nottingham-city-transport', 'Nottingham City Transport', 'United Kingdom', 'Nottinghamshire', 'qualitative_definition_on_map', 'system_map', 'https://images.nctx.co.uk/2025-08/Nottingham%20Colour%20Coded%20Map%20%28Web%29.pdf', 'map legend/key', 'Your frequent City bus network; High frequency routes to the City Centre on Monday to Saturday daytimes', null, null, 'Monday–Saturday daytime', null, 'Current Nottingham City Transport system map visually reviewed. It names frequent/high-frequency routes but gives no numeric threshold.', 'Frequent City bus network'],
  ['lothian-buses', 'Lothian Buses', 'United Kingdom', 'Edinburgh', 'qualitative_definition_on_map', 'system_map', 'https://www.lothianbuses.com/wp-content/uploads/2026/02/LB-Network-Map_260222.pdf', 'Airlink panel', '24/7 FREQUENT DEPARTURES', null, null, '24/7', 'daily', 'Current Lothian Buses network map visually reviewed. It names frequent departures but gives no numeric threshold.', 'Frequent departures'],
  ['reading-buses', 'Reading Buses', 'United Kingdom', 'Berkshire', 'numeric_definition_on_map', 'rider_guide', 'https://www.reading-buses.co.uk/park-ride', 'Mereoak park&ride 600 rider information', 'Running daily, our mereoak park & ride 600 service provides a fast and frequent connection to Central Reading up to every 15 minutes during the day.', 15, 'up to every 15 minutes', 'during the day', 'daily', 'Current Reading Buses rider information visually reviewed.', 'Fast and frequent service'],
  ['first-bus-aberdeen', 'First Bus Aberdeen', 'United Kingdom', 'Aberdeen', 'qualitative_definition_on_map', 'rider_guide', 'https://www.firstbus.co.uk/aberdeen/routes-and-maps/network-maps', 'network maps introduction', 'We have frequent services keeping you connected.', null, null, null, null, 'Current First Bus Aberdeen network-map guide visually reviewed. It names frequent services but gives no numeric threshold.', 'Frequent services'],
  ['first-bus-norwich', 'First Bus Norwich', 'United Kingdom', 'Norfolk', 'qualitative_definition_on_map', 'rider_guide', 'https://www.firstbus.co.uk/norfolk-suffolk/routes-and-maps/network-norwich', 'Network Norwich introduction and current map', 'We operate frequent, colour-coded bus routes that take you all across our fine city and beyond.', null, null, null, null, 'Current First Bus Norwich network guide/map visually reviewed. It names frequent routes but no single network-wide threshold.', 'Frequent bus routes'],
];

for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, threshold, thresholdText, serviceSpan, days, notes, label] of reviews) {
  if (existing.has(agencyId)) continue;
  const source = { url, sourceType, localFile: null };
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, canonicalAgencyId: agencyId, agencyName, country, region, status,
    mapCandidates: [source], preservedFiles: [], mapDate: null, mapPageOrSection: section, exactMapWording: exact,
    thresholdMinutes: threshold, thresholdText, serviceSpan, days, geography: null, mode: null, evidenceNotes: notes,
    reviewBatch: 29, evidenceSourceType: sourceType, reviewSources: [source], definitions: [{ id: 'frequent', label,
      thresholdMinutes: threshold, thresholdText, representative: status === 'numeric_definition_on_map', sourceType,
      sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }],
    representativeThresholdMinutes: status === 'numeric_definition_on_map' ? threshold : null,
    publishedFrequencyBands: null, mergedAgencyIds: [], agencyAliases: [],
  });
}

audit.records = audit.records.map((record, index) => ({ ...record, auditOrder: index + 1 }));
audit.scope = 'First 50 agencies plus 281 additional unique agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log('Recorded batch 29.');
