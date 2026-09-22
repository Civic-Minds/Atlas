import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['cota', 'Central Ohio Transit Authority', 'United States', 'Ohio', 'numeric_definition_on_map', 'system_map', 'https://www.cota.com/timetables/cota-system-map.pdf', 'one-page map, SERVICE TYPE / frequency legend', 'FREQUENT — Serving you throughout the day — Departure times are every 15 minutes or less', 15, 'every 15 minutes or less', 'throughout the day', null, 'Official COTA system map visually reviewed.', 'Frequent'],
  ['capmetro', 'CapMetro', 'United States', 'Texas', 'numeric_definition_on_map', 'system_map', 'https://www.capmetro.org/ride/plan/schedmap', 'High-Frequency Network map section', 'Our High-Frequency Network ... has 14 routes that operate every 15-30 minutes from 6 a.m. to 8 p.m., 7 days a week', 30, 'every 15–30 minutes', '6 a.m.–8 p.m.', '7 days/week', 'Official CapMetro rider-facing High-Frequency Network map/page visually reviewed. The slowest published period is used as representative.', 'High-Frequency Network'],
  ['bctransit-victoria', 'BC Transit Victoria', 'Canada', 'British Columbia', 'numeric_definition_on_map', 'rider_guide', 'https://www.bctransit.com/victoria/wp-content/uploads/sites/49/2026/09/vic_rg_sept2026_v2.pdf', 'Rider’s Guide page 11, Route Colours; also current system map legend', 'Frequent Route — 15 minutes or better between 7:00 a.m. and 7:00 p.m. Monday–Friday.', 15, '15 minutes or better', '7:00 a.m.–7:00 p.m.', 'Monday–Friday', 'Current BC Transit Victoria rider guide and system map visually reviewed.', 'Frequent Route'],
];

const existing = new Set(audit.records.map(record => record.agencyId));
let inserted = 0;
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, threshold, thresholdText, serviceSpan, days, notes, label] of reviews) {
  if (existing.has(agencyId)) continue;
  const source = { url, sourceType, localFile: null };
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [source], preservedFiles: [], mapDate: null, mapPageOrSection: section,
    exactMapWording: exact, thresholdMinutes: threshold, thresholdText, serviceSpan, days,
    geography: null, mode: null, evidenceNotes: notes, reviewBatch: 27,
    evidenceSourceType: sourceType, reviewSources: [source], definitions: [{ id: 'frequent', label,
      thresholdMinutes: threshold, thresholdText, representative: true, sourceType, sourceUrl: url,
      localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }],
    representativeThresholdMinutes: threshold, publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 286 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
