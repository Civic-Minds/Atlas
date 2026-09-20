import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['madison-metro', 'Madison Metro Transit', 'United States', 'Wisconsin', 'numeric_definition_on_map', 'system_map', 'https://www.cityofmadison.com/metro/documents/maps/system-maps/System_Map.pdf', 'July 2026 system-map legend', 'Frequent — Buses arrive every 15 minutes or less on weekdays and Saturdays, every 30 minutes or less Sundays and evenings.', 30, 'every 15 minutes or less weekdays and Saturdays; every 30 minutes or less Sundays and evenings', 'Current July 2026 Madison system map visually reviewed.'],
  ['rts-rochester', 'Regional Transit Service (Rochester)', 'United States', 'New York', 'numeric_definition_on_map', 'system_map', 'https://www.myrts.com/Portals/0/Documents/RTS%20System%20Map%209-1-2025.pdf', 'page 1 map legend', 'Frequent Service / Every 15 minutes Mon-Fri 6am-6pm. / Every 30 minutes at other times.', 30, 'every 15 minutes Monday–Friday 6 a.m.–6 p.m.; every 30 minutes at other times', 'Current RTS system map visually reviewed. The slower ordinary period is retained as the representative value.'],
  ['tarc-louisville', 'Transit Authority of River City', 'United States', 'Kentucky', 'numeric_definition_on_map', 'rider_guide', 'https://www.ridetarc.org/newtarcnetwork/', 'New TARC Network rider guide', 'Core routes connect to Downtown Louisville with frequent service running every 15–30 minutes seven days per week.', 30, 'every 15–30 minutes, seven days per week', 'Current TARC network rider guide visually reviewed. A second sentence states that some frequent routes run every 15 minutes or better; both are retained in the source note.'],
  ['nfta-buffalo', 'NFTA Metro', 'United States', 'New York', 'no_definition_on_map', 'system_map', 'https://metro.nfta.com/getting-around/system-maps', 'official system maps page', 'System maps cover Metro Rail and all Standard, Frequent, and Express fixed bus routes.', null, null, 'Official NFTA system-map material was reviewed. It names Frequent routes but gives no threshold or service span, so it is not counted as a complete definition.'],
  ['cdta-albany', 'Capital District Transportation Authority', 'United States', 'New York', 'no_definition_on_map', 'system_map', 'https://www.cdta.org/service-area-map', 'official service-area map', 'BRT Routes; Trunk Routes', null, null, 'Current CDTA map material was reviewed. It classifies services but does not name or define frequent/high-frequency service.'],
  ['greater-dayton-rta', 'Greater Dayton Regional Transit Authority', 'United States', 'Ohio', 'no_definition_on_map', 'system_map', 'https://www.iriderta.org/ride/ridetime/bus-routes-schedules', 'current system-map material', null, null, null, 'Current Greater Dayton RTA map material was reviewed. It shows routes and on-demand zones but no named frequent/high-frequency definition.'],
  ['rtc-washoe', 'RTC Washoe', 'United States', 'Nevada', 'no_definition_on_map', 'system_map', 'https://assets.rtcwashoe.com/wp-content/uploads/2024/03/19181938/NEW-SYSTEM-MAP-1.2024-scaled.jpg', 'system-map frequency legend', 'RAPID ROUTES — Service Every: 10 min. 7AM-7PM weekdays; 12 min. 7AM-7PM weekends.', null, null, 'Current RTC Washoe system map visually reviewed. It publishes Rapid intervals but does not name a frequent/high-frequency category.'],
  ['foothill-transit', 'Foothill Transit', 'United States', 'California', 'no_definition_on_map', 'rider_guide', 'https://www.foothilltransit.org/sites/default/files/2025-01/bus-book.pdf', 'current Bus Book route timetables', null, null, null, 'Current Foothill Transit Bus Book visually reviewed. It includes weekday and weekend timetables but no named frequent/high-frequency definition.'],
  ['samtrans', 'SamTrans', 'United States', 'California', 'no_definition_on_map', 'system_map', 'https://www.samtrans.com/media/33847/download', 'system map', null, null, null, 'Current August 2026 SamTrans system map visually reviewed. It shows routes and service markings but no named frequent/high-frequency definition.'],
];

const existing = new Set(audit.records.map(record => record.agencyId));
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, rep, thresholdText, notes] of reviews) {
  if (existing.has(agencyId)) throw new Error(`Duplicate audit agency: ${agencyId}`);
  const qualifies = status === 'numeric_definition_on_map' || status === 'qualitative_definition_on_map';
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [{ url, sourceType, localFile: null }], preservedFiles: [], mapDate: null,
    mapPageOrSection: section, exactMapWording: exact, thresholdMinutes: rep, thresholdText,
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 6,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }],
    definitions: qualifies ? [{ id: 'primary', label: exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: rep, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: rep, publishedFrequencyBands: null,
  });
}

audit.scope = 'First 50 agencies plus 87 additional agencies reviewed individually against current official system maps or approved rider guides on September 18, 2026.';
audit.updatedAt = '2026-09-18';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${reviews.length} additional manual reviews.`);
