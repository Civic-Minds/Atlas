import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const existing = new Set(audit.records.map(record => record.agencyId));

const newReviews = [
  ['bordeaux', 'TBM Bordeaux', 'France', 'Nouvelle-Aquitaine', 'numeric_definition_on_map', 'system_map', 'https://tbm2025.infotbm.com/wp-content/uploads/2025/10/SCHEMA_JOUR_DEC2025_05.pdf', 'system-map legend', 'Lignes structurantes avec un bus toutes les 10 à 15 minutes', 15, 'every 10 to 15 minutes', null, null, 'Current TBM schematic system map visually reviewed.', 'Structured lines'],
  ['grenoble', 'M réso Grenoble', 'France', 'Auvergne-Rhône-Alpes', 'numeric_definition_on_map', 'system_map', 'https://www.reso-m.fr/cms_viewFile.php?idtf=4603&path=PLAN-Mreso-NORD-2026.pdf', 'map legend', 'Tram: toutes les 4 à 10 minutes en semaine entre 7h et 19h; Chrono: toutes les 5 à 12 minutes en semaine entre 7h et 19h', 12, 'Tram every 4–10 minutes; Chrono every 5–12 minutes', '7h–19h weekday frequency window', 'weekdays', 'Current M réso Grenoble network map visually reviewed. The slowest named service band is used as representative.', 'Tram / Chrono'],
  ['indygo', 'IndyGo Indianapolis', 'United States', 'Indiana', 'no_definition_on_map', 'system_map', 'https://www.indygo.net/wp-content/uploads/2026/06/2606All.pdf', 'page 1 map legend, effective June 14, 2026', '15-Minute Route; 30-Minute Route; 60-Minute Route', null, null, null, null, 'Current IndyGo system map visually reviewed. Numeric bands appear, but no named frequent/high-frequency definition.', null],
  ['houston-metro', 'Houston METRO', 'United States', 'Texas', 'no_definition_on_map', 'system_map', 'https://assets-cdn-prod.azureedge.us/assets/docs/default-source/system-map/metro-system-map-2.pdf', 'page 1 map legend, effective July 2026', 'Weekday Midday Frequency; 10, 12, or 15 minute frequency; 30 minute frequency; 60 minute frequency', null, null, null, null, 'Current Houston METRO system map visually reviewed. Frequency bands are generic and not named frequent/high-frequency service.', null],
  ['sfmta', 'SFMTA Muni', 'United States', 'California', 'no_definition_on_map', 'system_map', 'https://www.sfmta.com/media/37783/download?inline', 'page 1 transit-map legend, effective June 21, 2025', '15 minutes or less; Muni Rapid Bus — 12 minutes or less; 10 min or less; Every 10–20 min; Every 20–30 min', null, null, 'daytime service', null, 'Current SFMTA Muni map visually reviewed. Frequency bands appear, but no named frequent/high-frequency definition.', null],
  ['hart-tampa', 'HART Tampa', 'United States', 'Florida', 'no_definition_on_map', 'system_map', 'https://www.gohart.org/Style%20Library/goHART/pdfs/service/HART_SYSTEM_MAP_06-2026.pdf', 'page 1 map legend, effective June 7, 2026', 'Local Route; Limited Express Route; HARTFlex Route', null, null, null, null, 'Current HART system map visually reviewed. No named frequent/high-frequency definition.', null],
  ['calgary', 'Calgary Transit', 'Canada', 'Alberta', 'no_definition_on_map', 'system_map', 'https://www.calgarytransit.com/content/dam/transit/rider-information/System%20Map%20Dec%202025.pdf', 'page 1 service-information/chart area', 'times and approximate frequency, in minutes; AM peak; PM peak; evening service bands', null, null, null, null, 'Current Calgary Transit system map visually reviewed. Route-specific approximate intervals are not a named frequent-service definition.', null],
  ['auckland-transport', 'Auckland Transport', 'New Zealand', 'Auckland', 'no_definition_on_map', 'system_map', 'https://at.govt.nz/media/l5vpxayy/auckland-transport-map-of-all-bus-train-and-ferry-routes.pdf', 'current network map, June 2026, lower-left legend', null, null, null, null, null, 'Current Auckland Transport network map visually reviewed. No named frequent/high-frequency definition appears.', null],
  ['marseille', 'RTM Marseille', 'France', 'Provence-Alpes-Côte d’Azur', 'no_definition_on_map', 'system_map', 'https://api.rtm.fr/fiche-horaires/rtm_plan_reseau.pdf', 'September 2026 network-map legend', 'Desserte occasionnelle; Lignes de bus circulant en soirée', null, null, null, null, 'Current RTM network map visually reviewed. It has service labels but no numeric frequent-service definition.', null],
  ['toulouse', 'Tisséo Toulouse', 'France', 'Occitanie', 'no_definition_on_map', 'rider_guide', 'https://www.tisseo.fr/sites/default/files/media/Depliant-parc-relais.pdf', 'July 2026 rider-guide/map page 2 legend', 'Parc relais à accès réglementé; Parc relais à accès libre; Parc à vélo; Autopartage', null, null, null, null, 'Current Tisséo rider guide/map visually reviewed. It contains access and parking information, not a frequent-service definition.', null],
];

for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, threshold, thresholdText, serviceSpan, days, notes, label] of newReviews) {
  if (existing.has(agencyId)) continue;
  const source = { url, sourceType, localFile: null };
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, canonicalAgencyId: agencyId, agencyName, country, region, status,
    mapCandidates: [source], preservedFiles: [], mapDate: null, mapPageOrSection: section, exactMapWording: exact,
    thresholdMinutes: threshold, thresholdText, serviceSpan, days, geography: null, mode: null, evidenceNotes: notes,
    reviewBatch: 28, evidenceSourceType: sourceType, reviewSources: [source], definitions: threshold == null && status === 'no_definition_on_map' ? [] : [{
      id: 'frequent', label: label ?? 'Frequent service', thresholdMinutes: threshold, thresholdText,
      representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section,
      exactWording: exact, evidenceNotes: notes,
    }], representativeThresholdMinutes: status === 'numeric_definition_on_map' ? threshold : null,
    publishedFrequencyBands: null, mergedAgencyIds: [], agencyAliases: [],
  });
}

const upgrades = {
  transperth: {
    status: 'qualitative_definition_on_map', sourceType: 'system_map', url: 'https://www.transperth.wa.gov.au/LinkClick.aspx?fileticket=ik6Mbte1weE%3D',
    section: 'current Zone Map, effective 13 October 2025, right-side legend', exact: 'High Frequency Services',
    note: 'Current Transperth Zone Map visually reviewed. It names High Frequency Services but publishes no threshold.', label: 'High Frequency Services', threshold: null,
  },
  'adelaide-metro': {
    status: 'numeric_definition_on_map', sourceType: 'rider_guide', url: 'https://www.adelaidemetro.com.au/__data/assets/pdf_file/0011/1544078/gawler_ttable_routemap_13_10_25_web.pdf',
    section: 'Gawler Train Timetable V8, pages 1 and 8 visual red legend', exact: 'High Frequency Stations; Trains stopping at these stations offer services approximately every 15 minutes, 7:30am to 6:30pm Monday to Friday.',
    note: 'Current Adelaide Metro rider guide visually reviewed and upgraded from qualitative to numeric evidence.', label: 'High Frequency Stations', threshold: 15, thresholdText: 'approximately every 15 minutes', serviceSpan: '7:30am–6:30pm', days: 'Monday–Friday',
  },
};
for (const [agencyId, update] of Object.entries(upgrades)) {
  const record = audit.records.find(item => item.agencyId === agencyId);
  if (!record) throw new Error(`Missing upgrade record: ${agencyId}`);
  const source = { url: update.url, sourceType: update.sourceType, localFile: null };
  record.status = update.status;
  record.mapCandidates = [...(record.mapCandidates ?? []), source];
  record.reviewSources = [...(record.reviewSources ?? []), source];
  record.mapPageOrSection = update.section;
  record.exactMapWording = update.exact;
  record.thresholdMinutes = update.threshold;
  record.thresholdText = update.thresholdText ?? null;
  record.serviceSpan = update.serviceSpan ?? null;
  record.days = update.days ?? null;
  record.evidenceNotes = `${record.evidenceNotes} ${update.note}`;
  record.reviewBatch = 28;
  record.definitions = [{ id: 'frequent', label: update.label, thresholdMinutes: update.threshold, thresholdText: update.thresholdText ?? null,
    representative: true, sourceType: update.sourceType, sourceUrl: update.url, localFile: null,
    mapPageOrSection: update.section, exactWording: update.exact, evidenceNotes: update.note }];
  record.representativeThresholdMinutes = update.status === 'numeric_definition_on_map' ? update.threshold : null;
}

audit.records = audit.records.map((record, index) => ({ ...record, auditOrder: index + 1 }));
audit.scope = 'First 50 agencies plus 280 additional unique agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log('Recorded batch 28 and upgraded two existing records.');
