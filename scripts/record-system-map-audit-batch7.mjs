import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['godurham', 'GoDurham', 'United States', 'North Carolina', 'qualitative_definition_on_map', 'system_map', 'https://godurhamtransit.org/wp-content/uploads/GoDurham-System-Map.pdf', 'page 1 system-map legend', 'Frequent Service Network', null, null, 'Current GoDurham system map visually reviewed. It names a Frequent Service Network but gives no numeric threshold.'],
  ['champaign-urbana-mtd', 'Champaign-Urbana Mass Transit District', 'United States', 'Illinois', 'qualitative_definition_on_map', 'rider_guide', 'https://mtd.org/media/4873/2026-27-ms-book-interior.pdf', 'printed page 10 / PDF page 13', 'High-frequency Hoppers connect busy hubs; this super high-frequency service', null, null, 'Current 2026–27 MTD maps and schedules book visually reviewed. It names high-frequency service but gives no numeric threshold.'],
  ['duluth-transit', 'Duluth Transit Authority', 'United States', 'Minnesota', 'numeric_definition_on_map', 'system_map', 'https://www.duluthtransit.com/wp-content/uploads/2026/04/System-Map-Updated-2.26-002.pdf', 'page 1 system-map legend', 'Go Line - Blue (15-min); Go Line - Green (15-min)', 15, '15-minute Go Line service', 'Current April 2026 Duluth system map visually reviewed.'],
  ['pace-pulse', 'Pace Suburban Bus', 'United States', 'Illinois', 'no_definition_on_map', 'system_map', 'https://www.pacebus.com/sites/default/files/2026-07/Pulse%20System%20Map%20%282026%29.pdf', 'page 1 system map', 'Pulse Milwaukee Line; Pulse Dempster Line', null, null, 'Current 2026 Pace Pulse system map visually reviewed. It names Pulse lines but does not define frequent/high-frequency service.'],
  ['rabbittransit', 'Capital Area Transit / rabbittransit', 'United States', 'Pennsylvania', 'no_definition_on_map', 'rider_guide', 'https://www.rabbittransit.org/wp-content/uploads/2026/09/Capital-Region-Ride-Guide-8-7-26-webview.pdf', 'Capital Region Ride Guide', null, null, null, 'Current August 2026 Capital Region rider guide visually reviewed. It does not name or define frequent/high-frequency service.'],
];

const existing = new Set(audit.records.map(record => record.agencyId));
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, rep, thresholdText, notes] of reviews) {
  if (existing.has(agencyId)) throw new Error(`Duplicate audit agency: ${agencyId}`);
  const qualifies = status === 'numeric_definition_on_map' || status === 'qualitative_definition_on_map';
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [{ url, sourceType, localFile: null }], preservedFiles: [], mapDate: null,
    mapPageOrSection: section, exactMapWording: exact, thresholdMinutes: rep, thresholdText,
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 7,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }],
    definitions: qualifies ? [{ id: 'primary', label: exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: rep, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: rep, publishedFrequencyBands: null,
  });
}

audit.scope = 'First 50 agencies plus 92 additional agencies reviewed individually against current official system maps or approved rider guides on September 18, 2026.';
audit.updatedAt = '2026-09-18';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${reviews.length} additional manual reviews.`);
