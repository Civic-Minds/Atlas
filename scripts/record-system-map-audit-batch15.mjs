import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const acTransit = audit.records.find(record => record.agencyId === 'ac-transit');
if (!acTransit) throw new Error('AC Transit record not found');
acTransit.status = 'numeric_definition_on_map';
acTransit.mapCandidates = [{ url: 'https://www.actransit.org/sites/default/files/2026-09/System%20Overview%20Map%20with%20Insets.pdf', sourceType: 'system_map', localFile: null }];
acTransit.mapPageOrSection = 'current map frequency legend';
acTransit.exactMapWording = '10–15 minutes; 16–30 minutes; 31 minutes or less frequently; bus lines that together provide more frequent service in overlapping sections.';
acTransit.thresholdMinutes = 15;
acTransit.thresholdText = '10–15-minute frequent band; overlapping lines can provide more frequent service';
acTransit.evidenceNotes = 'Current August 2026 AC Transit system overview map visually reviewed again. The map provides explicit frequency bands and identifies overlapping lines that provide more frequent service; 15 minutes is the representative frequent band.';
acTransit.reviewBatch = 15;
acTransit.evidenceSourceType = 'system_map';
acTransit.reviewSources = [{ url: 'https://www.actransit.org/sites/default/files/2026-09/System%20Overview%20Map%20with%20Insets.pdf', sourceType: 'system_map', localFile: null }];
acTransit.definitions = [{ id: 'primary', label: 'Frequent service bands', thresholdMinutes: 15, thresholdText: '10–15-minute frequent band; overlapping lines can provide more frequent service', representative: true, sourceType: 'system_map', sourceUrl: 'https://www.actransit.org/sites/default/files/2026-09/System%20Overview%20Map%20with%20Insets.pdf', localFile: null, mapPageOrSection: 'current map frequency legend', exactWording: acTransit.exactMapWording, evidenceNotes: acTransit.evidenceNotes }];
acTransit.representativeThresholdMinutes = 15;

const existing = new Set(audit.records.map(record => record.agencyId));
if (!existing.has('big-blue-bus')) {
  audit.records.push({
    auditOrder: audit.records.length + 1,
    agencyId: 'big-blue-bus', agencyName: 'Big Blue Bus', country: 'United States', region: 'California', status: 'numeric_definition_on_map',
    mapCandidates: [{ url: 'https://www.bigbluebus.com/Routes-and-Schedules/PdfHandler.ashx/system-map.pdf', sourceType: 'system_map', localFile: null }],
    preservedFiles: [], mapDate: '2026-04-05', mapPageOrSection: 'current system map frequency legend',
    exactMapWording: 'FREQUENT SERVICE — 15 MINUTES OR BETTER. Applies to weekday midday trips only.', thresholdMinutes: 15,
    thresholdText: '15 minutes or better, weekday midday trips', serviceSpan: 'weekday midday', days: 'weekdays', geography: null, mode: 'bus',
    evidenceNotes: 'Official Big Blue Bus system map, effective April 5, 2026, visually reviewed.', reviewBatch: 15, evidenceSourceType: 'system_map',
    reviewSources: [{ url: 'https://www.bigbluebus.com/Routes-and-Schedules/PdfHandler.ashx/system-map.pdf', sourceType: 'system_map', localFile: null }],
    definitions: [{ id: 'primary', label: 'Frequent Service', thresholdMinutes: 15, thresholdText: '15 minutes or better, weekday midday trips', representative: true, sourceType: 'system_map', sourceUrl: 'https://www.bigbluebus.com/Routes-and-Schedules/PdfHandler.ashx/system-map.pdf', localFile: null, mapPageOrSection: 'current system map frequency legend', exactWording: 'FREQUENT SERVICE — 15 MINUTES OR BETTER. Applies to weekday midday trips only.', evidenceNotes: 'Official Big Blue Bus system map, effective April 5, 2026, visually reviewed.' }],
    representativeThresholdMinutes: 15, publishedFrequencyBands: null,
  });
}

audit.records.sort((a, b) => a.auditOrder - b.auditOrder);
audit.scope = 'First 50 agencies plus 178 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log('Updated AC Transit and recorded Big Blue Bus.');
