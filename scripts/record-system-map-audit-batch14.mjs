import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['go-transit', 'GO Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://assets.metrolinx.com/image/upload/Documents/GO/system-map.pdf', 'map legend', 'Regular service; Limited service; Union Pearson Express — Operates every 15 minutes.', null, null, 'Official GO Transit system map visually reviewed. It shows regular, limited, and express services but no named frequent/high-frequency category.'],
  ['transit-windsor', 'Transit Windsor', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://www.citywindsor.ca/documents/residents/transit-windsor/Transit-System-Map-24-x-32-2024.pdf', 'map legend', 'Primary Route; Primary Route Intermittent Service; Secondary Route; Secondary Route Intermittent Service; Local Route; Express Route; Regional Route.', null, null, 'Official Transit Windsor system map visually reviewed. It lists route types but no named frequent/high-frequency definition or threshold.'],
  ['timmins-transit', 'Timmins Transit', 'Canada', 'Ontario', 'numeric_definition_on_map', 'rider_guide', 'https://www.timmins.ca/our_services/timmins_transit/timmins_transit_on-demand', '15-Minute Frequency section', 'A conventional bus travels to and coming from Porcupine and South Porcupine every 15 minutes. Weekdays approximately 6:40 a.m. to 10:50 p.m.; Saturdays 6:40 a.m. to 10:50 p.m.; Sundays 8:40 a.m. to 6:50 p.m.', 15, 'every 15 minutes with published weekday, Saturday, and Sunday spans', 'Official Timmins Transit rider-facing service page visually reviewed. It explicitly names a 15-Minute Frequency service and gives the span.'],
  ['sault-ste-marie-transit', 'Sault Ste. Marie Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://saultstemarie.ca/wp-content/uploads/2026/05/2026-TRANSIT-LOOPS_-NEW-NAMES_WALL-MAP_36x48_06May2026.pdf', '2026 system map legend', 'SSM TRANSIT ROUTE MAP; HILLSIDE; CITYWIDE; WESTSIDE; EASTSIDE.', null, null, 'Official 2026 Sault Ste. Marie system map visually reviewed. It identifies routes but no named frequent/high-frequency definition.'],
  ['cornwall-transit', 'Cornwall Transit', 'Canada', 'Ontario', 'no_definition_on_map', 'system_map', 'https://media-003-ca.cdn.govstack.com/cornwall-ca/media/aixlatr4/transit-map-oct_2025-revised-final.pdf', 'legend/page 1', 'Regular Service / Service Régulier; Start of half hour service; Start of one hour service.', null, null, 'Official Cornwall Transit map and schedule PDF visually reviewed. Timetable notes are not a named frequent-service category.'],
  ['atac-rome', 'ATAC Rome', 'Italy', 'Lazio', 'numeric_definition_on_map', 'rider_guide', 'https://www.atac.roma.it/docs/default-source/pubblicazioni/carta-della-qualit%C3%A0-dei-servizi-di-tpl-anno-2024.pdf?sfvrsn=e0a379b1_8', 'Carta della Qualità, urban lines frequency categories', 'Urbane — Linee a frequenza alta, media o bassa; alta frequenza.', 15, 'named high-frequency urban category with published interval bands', 'Official ATAC service charter visually reviewed. The high-frequency urban category is retained; express service was excluded.'],
  ['gtt-turin', 'GTT Turin', 'Italy', 'Piedmont', 'numeric_definition_on_map', 'rider_guide', 'https://gtt.to.it/cms/risorse/cdm.pdf', 'Carta della Mobilità 2025, priority lines', 'Linee prioritarie; intervalli di passaggio compresi tra 5 e 8 minuti circa.', 8, 'priority lines with approximately 5–8-minute intervals', 'Official GTT mobility charter visually reviewed. It names the priority-line tier and gives its interval range; 8 minutes is the representative slowest interval.'],
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
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 14,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }],
    definitions: qualifies ? [{ id: 'primary', label: exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: rep, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: rep, publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 182 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
