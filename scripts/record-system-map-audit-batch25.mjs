import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['cincinnatimetro', 'Metro Regional Transit Authority', 'United States', 'Ohio', 'numeric_definition_on_map', 'system_map', 'https://www.go-metro.com/wp-content/uploads/2025/04/metrosystemmap.pdf', 'legend, upper-left/center', 'On weekdays at midday, buses arrive every: 15 Minutes Or Better.', 15, '15 minutes or better', 'weekday midday', 'weekdays', 'Official Metro Regional system map visually reviewed.', 'Frequent service'],
  ['rgrta', 'Regional Transit Service', 'United States', 'New York', 'numeric_definition_on_map', 'system_map', 'https://www.myrts.com/Portals/0/Documents/RTS%20System%20Map%209-1-2025.pdf', 'map legend, page 1', 'Frequent Service; Every 15 minutes Mon-Fri 6am-6pm. Every 30 minutes at other times.', 30, 'every 15 minutes Mon-Fri 6am-6pm; every 30 minutes at other times', '6am–6pm weekdays and other times', 'Monday–Friday plus other times', 'Official RTS system map visually reviewed. The slowest published frequent-service period is used as the representative threshold.', 'Frequent Service'],
  ['octranspo', 'OC Transpo', 'Canada', 'Ontario', 'numeric_definition_on_map', 'system_map', 'https://www.octranspo.com/images/files/maps/network_maps/New_service_map_ROUTE_REVIEW_2024_%28MASTER%29_19Aug2024.pdf', 'map legend, bottom centre', 'Frequent • Fréquent; Service every 15 minutes or less on weekdays 06:00 to 18:00. Operating 7 days/week in all time periods.', 15, 'every 15 minutes or less', '06:00–18:00 weekdays', '7 days/week in all time periods', 'Official OC Transpo network map visually reviewed.', 'Frequent'],
  ['jta', 'Jacksonville Transportation Authority', 'United States', 'Florida', 'numeric_definition_on_map', 'system_map', 'https://www.jtafla.com/media/xt4gbo35/ops-25016-system-map-09-2025.pdf', 'legend, upper-right', 'FREQUENT ROUTES (15–20 min); Weekdays 6:30 am to 6:00 pm; Core Frequent Route: 15 min; Combined Frequent Routes: 15–20 min.', 20, '15–20 minutes', '6:30am–6pm', 'weekdays', 'Official JTA system map visually reviewed. The slowest published frequent tier is used as the representative threshold.', 'Frequent Routes'],
];

const existing = new Map(audit.records.map(record => [record.agencyId, record]));
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, threshold, thresholdText, serviceSpan, days, notes, label] of reviews) {
  const old = existing.get(agencyId);
  const source = { url, sourceType, localFile: null };
  const record = old ?? { auditOrder: audit.records.length + 1, agencyId, agencyName, country, region };
  Object.assign(record, {
    agencyName, country, region, status, mapCandidates: [source], preservedFiles: old?.preservedFiles ?? [],
    mapDate: null, mapPageOrSection: section, exactMapWording: exact, thresholdMinutes: threshold,
    thresholdText, serviceSpan, days, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 25,
    evidenceSourceType: sourceType, reviewSources: [source], definitions: [{ id: 'frequent', label,
      thresholdMinutes: threshold, thresholdText, representative: true, sourceType, sourceUrl: url,
      localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }],
    representativeThresholdMinutes: threshold, publishedFrequencyBands: null,
  });
  if (!old) audit.records.push(record);
}

// Correct current records that were previously classified too conservatively.
const upgrades = {
  'transport-victoria-melbourne': ['numeric_definition_on_map', 20, '20 minute frequency for most of the day', 'Your local high frequency bus network; *20 minute frequency for most of the day.', 'https://edge.sitecorecloud.io/stategovernc45d-cftw-production-c9ca/media/Project/TransportWebsite/Forms/DTP2029_Rapid-Bus-Product_Digital_A3_North_FINAL.pdf', 'system map, page 1', 'High frequency bus network'],
  'gcrta': ['numeric_definition_on_map', 15, '15 min or better', '15 min or better; 30 min; 40–45; 60', 'https://www.riderta.com/systemmap', 'frequency map controls on official interactive system map', 'Frequent service'],
  'hsl-helsinki': ['qualitative_definition_on_map', null, null, 'Runkolinjat / Stomlinjenät / Trunk routes; a network of frequent services.', 'https://www.hsl.fi/en/hsl/trunk-route-network', 'current trunk-route map page and heading', 'Trunk routes'],
  'stib-brussels': ['qualitative_definition_on_map', null, null, 'CHRONO; fréquences élevées / hoge frequentie / high frequencies.', 'https://www.stib-mivb.be/files/live/sites/STIBMIVB/files/Travel/Plans%20r%C3%A9seau/SCHM_Plan_NEXT.pdf', 'map legend, lower-right corner', 'CHRONO'],
  'tcl-lyon': ['qualitative_definition_on_map', null, null, 'Plan des lignes fortes; selected strong-line routes show 2 min, 3 min, and 6 min service.', 'https://www.tcl.fr/sites/default/files/2026-08/Plan_des_lignes_fortes_TCL.pdf', 'map title/legend', 'Strong lines'],
};
for (const [agencyId, [status, threshold, thresholdText, exact, url, section, label]] of Object.entries(upgrades)) {
  const record = existing.get(agencyId);
  if (!record) continue;
  const source = { url, sourceType: 'system_map', localFile: null };
  Object.assign(record, { status, mapCandidates: [source], mapPageOrSection: section, exactMapWording: exact,
    thresholdMinutes: threshold, thresholdText, evidenceNotes: 'Current official map evidence was rechecked and the record upgraded.',
    reviewBatch: 25, evidenceSourceType: 'system_map', reviewSources: [source], definitions: [{ id: 'frequent', label,
      thresholdMinutes: threshold, thresholdText, representative: true, sourceType: 'system_map', sourceUrl: url,
      localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: 'Current official map evidence was rechecked and the record upgraded.' }],
    representativeThresholdMinutes: threshold, publishedFrequencyBands: null });
}

audit.scope = 'First 50 agencies plus 268 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Updated audit with ${reviews.length} new or corrected reviews.`);
