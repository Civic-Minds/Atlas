import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  {
    agencyId: 'minneapolis-metro', agencyName: 'Metro Transit (Minneapolis–St. Paul)', country: 'United States', region: 'Minnesota',
    status: 'numeric_definition_on_map', url: 'https://www.metrotransit.org/Data/Sites/1/media/pdfs/system-map.pdf', section: 'page 1, Downtown Map Legend',
    exact: 'Frequent Local Buses — Serve all stops and operate at least every 30 min. during middays on weekdays, more often during rush hours. Evening and weekend service may be less frequent.',
    rep: 30, thresholdText: 'at least every 30 minutes during weekday middays; more often during rush hours', notes: 'Official Metro Transit system map visually reviewed. The map explicitly names Frequent Local Buses and gives its weekday midday threshold.'
  },
  {
    agencyId: 'cota-columbus', agencyName: 'Central Ohio Transit Authority', country: 'United States', region: 'Ohio',
    status: 'numeric_definition_on_map', url: 'https://www.cota.com/timetables/cota-system-map.pdf', localFile: 'cota-system-map.pdf', section: 'page 1, SERVICE TYPE / frequency legend',
    exact: 'FREQUENT — Serving you throughout the day — Departure times are every 15 minutes or less.',
    rep: 15, thresholdText: 'every 15 minutes or less throughout the day', notes: 'Official COTA system map visually reviewed. The legend explicitly names Frequent service and gives its threshold.'
  },
  {
    agencyId: 'indygo', agencyName: 'IndyGo', country: 'United States', region: 'Indiana',
    status: 'no_definition_on_map', url: 'https://www.indygo.net/wp-content/uploads/2026/01/FSM_2506_WebFull.pdf', section: 'page 1, map legend',
    exact: '15-Minute Route; 30-Minute Route; 60-Minute Route', notes: 'Official IndyGo weekday network map visually reviewed. It publishes frequency bands but does not name a frequent or high-frequency category, so it is not counted as a definition.'
  },
  {
    agencyId: 'mcts-milwaukee', agencyName: 'Milwaukee County Transit System', country: 'United States', region: 'Wisconsin',
    status: 'numeric_definition_on_map', url: 'https://www.ridemcts.com/getattachment/Routes-Schedules/System-Map/2026-MAR-System-Map-Double-Sided.pdf?lang=en-US', localFile: 'mcts-system-map.pdf', section: 'page 1, route-frequency legend',
    exact: 'Frequent Service — Buses will come every 15 minutes during morning and afternoon peak periods.',
    rep: 15, thresholdText: 'every 15 minutes during morning and afternoon peak periods', notes: 'Current Spring 2026 MCTS system map visually reviewed. It explicitly defines Frequent Service and notes that evening and weekend service varies by route.'
  },
  {
    agencyId: 'wego-nashville', agencyName: 'WeGo Public Transit', country: 'United States', region: 'Tennessee',
    status: 'qualitative_definition_on_map', url: 'https://www.wegotransit.com/assets/1/24/WEB_Nashville_System_Map_Jan_2026.pdf', localFile: 'wego-system-map.pdf', section: 'page 1 legend and page 2 Route Information table',
    exact: 'Frequent Service', notes: 'Current January 2026 WeGo system map visually reviewed. It names Frequent Service and lists route-specific 10–30-minute periods, but does not state one universal cutoff.'
  },
  {
    agencyId: 'jta-jacksonville', agencyName: 'Jacksonville Transportation Authority', country: 'United States', region: 'Florida',
    status: 'numeric_definition_on_map', url: 'https://www.jtafla.com/media/xt4gbo35/ops-25016-system-map-09-2025.pdf', localFile: 'jta-system-map.pdf', section: 'page 1, upper-right legend',
    exact: 'FREQUENT ROUTES (15–20 min); Core Frequent Route: 15 min.',
    rep: 20, thresholdText: '15–20 minutes; core frequent routes every 15 minutes', notes: 'Official JTA system map visually reviewed. It explicitly names Frequent Routes and a Core Frequent Route with numeric intervals.'
  },
  {
    agencyId: 'via-san-antonio', agencyName: 'VIA Metropolitan Transit', country: 'United States', region: 'Texas',
    status: 'numeric_definition_on_map', url: 'https://www.viainfo.net/wp-content/uploads/2024/08/2026_0107-VIA-System-Map.pdf', localFile: 'via-san-antonio-system-map.pdf', section: 'page 1 legend and page 2 service guide',
    exact: 'Frequent Service: during midday, buses come every 15 minutes or less or every 20 minutes or less.',
    rep: 20, thresholdText: 'every 15 minutes or less or every 20 minutes or less during midday', notes: 'Current January 2026 VIA system map visually reviewed. It explicitly names Frequent Service and gives the published midday bands.'
  },
  {
    agencyId: 'capmetro-austin', agencyName: 'CapMetro', country: 'United States', region: 'Texas',
    status: 'numeric_definition_on_map', url: 'https://www.capmetro.org/docs/default-source/plan-your-trip-docs/destination-schedule-book-docs/system_map.pdf?sfvrsn=eb974f8_48', localFile: 'capmetro-system-map.pdf', section: 'map legend and Our Services table',
    exact: 'High-Frequency Routes: buses arrive every 15 minutes on weekdays, and every 15–30 minutes early morning, later evening, and weekends.',
    rep: 30, thresholdText: 'every 15 minutes on weekdays; every 15–30 minutes early morning, later evening, and weekends', notes: 'Official CapMetro bus and rail service map/rider guide visually reviewed. It explicitly names High-Frequency Routes and publishes the weekday and weekend bands.'
  },
  {
    agencyId: 'thebus-honolulu', agencyName: 'TheBus', country: 'United States', region: 'Hawaii',
    status: 'qualitative_definition_on_map', url: 'https://www.thebus.org/SystemMap/SystemMap20260701.pdf', localFile: 'thebus-system-map.pdf', section: 'page 2, TheBus Route Guide',
    exact: 'Frequent Urban Routes', notes: 'Current July 2026 TheBus system map visually reviewed. It names Frequent Urban Routes and provides route-by-route headways, but does not state the cutoff used to classify them.'
  },
  {
    agencyId: 'houston-metro', agencyName: 'METRO Houston', country: 'United States', region: 'Texas',
    status: 'no_definition_on_map', url: 'https://assets-cdn-prod.azureedge.us/assets/docs/default-source/system-map/metro-system-map-2.pdf', section: 'map frequency legend',
    exact: '10, 12, or 15 minute frequency; 30 minute frequency; 60 minute frequency; Peak only service.', notes: 'Current July 2026 Houston METRO system map visually reviewed. It publishes frequency bands but does not name a frequent or high-frequency category; the red/blue/green route explanation is not labeled frequent service.'
  },
  {
    agencyId: 'sacrt', agencyName: 'Sacramento Regional Transit District', country: 'United States', region: 'California',
    status: 'no_definition_on_map', url: 'https://www.sacrt.com/wp-content/uploads/SacRT_SystemMap_Effective-August-29-2021-1.pdf', section: 'map legend',
    exact: null, notes: 'Official SacRT system map visually reviewed. Its legend shows routes, stations, and connections but does not name frequent/high-frequency service or publish a threshold.'
  },
  {
    agencyId: 'cats-charlotte', agencyName: 'Charlotte Area Transit System', country: 'United States', region: 'North Carolina',
    status: 'no_definition_on_map', url: 'https://www.charlottenc.gov/files/sharedassets/cats/cats-images/cats-system-map.pdf', section: 'map legend',
    exact: 'Local bus route; Neighborhood bus route; Express route; MetroRAPID route.', notes: 'Current CATS rider map visually reviewed. It classifies route types but does not define frequent/high-frequency service. An older planning document was not counted.'
  },
  {
    agencyId: 'hart-tampa', agencyName: 'Hillsborough Area Regional Transit', country: 'United States', region: 'Florida',
    status: 'no_definition_on_map', url: 'https://www.gohart.org/Style%20Library/goHART/pdfs/service/HART_SYSTEM_MAP_06-2026.pdf', section: 'page 1, map legend',
    exact: 'Local Route and Route Number; Limited Express Route and Route Number; HARTFlex Route.', notes: 'Current June 2026 HART system map visually reviewed. It classifies routes but does not name or define frequent/high-frequency service.'
  },
  {
    agencyId: 'cincinnati-metro', agencyName: 'Cincinnati Metro', country: 'United States', region: 'Ohio',
    status: 'no_definition_on_map', url: 'https://www.go-metro.com/wp-content/uploads/2025/10/metrosystemmap_October2025.pdf', section: 'page 1, map legend',
    exact: 'On weekdays at midday, buses arrive every: 15 Minutes Or Better; 20–35 Minutes; 40–55 Minutes; 60+ Minutes.', notes: 'Current Cincinnati Metro system map visually reviewed. It publishes generic frequency bands but does not name a frequent/high-frequency category.'
  },
  {
    agencyId: 'broward-county-transit', agencyName: 'Broward County Transit', country: 'United States', region: 'Florida',
    status: 'map_unavailable', url: 'https://www.broward.org/BCT?event=1', section: 'official system map link',
    exact: null, notes: 'The current official system-map link was located, but the linked CDN PDF failed to load during manual review. Separate future planning material was not counted as a current rider-map definition.'
  },
  {
    agencyId: 'sfmta', agencyName: 'San Francisco Municipal Transportation Agency', country: 'United States', region: 'California',
    status: 'no_definition_on_map', url: 'https://www.sfmta.com/media/37783/download?inline', section: 'page 1, San Francisco Transit Map legend',
    exact: 'Muni Rapid Bus — 12 minutes or less; Every 10–20 min; Every 20–30 min.', notes: 'Current June 2025 Muni map visually reviewed. It publishes Rapid Bus and generic frequency bands but does not name or define frequent/high-frequency service.'
  },
  {
    agencyId: 'pittsburgh-regional-transit', agencyName: 'Pittsburgh Regional Transit', country: 'United States', region: 'Pennsylvania',
    status: 'no_definition_on_map', url: 'https://www.rideprt.org/system-map/', section: 'official interactive system map controls and legend',
    exact: null, notes: 'Current official interactive system map reviewed. It provides weekday/Saturday/Sunday views but no named frequent/high-frequency definition or threshold.'
  },
  {
    agencyId: 'ac-transit', agencyName: 'AC Transit', country: 'United States', region: 'California',
    status: 'no_definition_on_map', url: 'https://www.actransit.org/sites/default/files/2026-09/System%20Overview%20Map%20with%20Insets.pdf', section: 'map legend and line styling',
    exact: 'Identify the most heavily served lines through their more vibrant colors and thicker lines.', notes: 'Current August 2026 AC Transit system overview map visually reviewed. It indicates heavier service graphically but does not name a frequent/high-frequency category or give a threshold.'
  },
  {
    agencyId: 'nj-transit', agencyName: 'NJ Transit', country: 'United States', region: 'New Jersey',
    status: 'no_definition_on_map', url: 'https://content.njtransit.com/sites/default/files/maps/RSM_Geographic_051426.pdf', section: 'page 1, rail map legend',
    exact: null, notes: 'Current NJ Transit rail system map visually reviewed. It identifies modes, stations, and connections but does not name or define frequent/high-frequency service.'
  },
  {
    agencyId: 'metro-st-louis', agencyName: 'Metro Transit St. Louis', country: 'United States', region: 'Missouri',
    status: 'no_definition_on_map', url: 'https://www.metrostlouis.org/wp-content/uploads/2025/02/250207_Metro-Missouri-Map-w_Downtown.pdf', section: 'page 1, legend',
    exact: 'Full Service; Limited Service.', notes: 'Current Metro Transit Missouri system map visually reviewed. It names full and limited service but does not define frequent/high-frequency service or give a frequency number.'
  },
];

const existing = new Set(audit.records.map(record => record.agencyId));
for (const review of reviews) {
  if (existing.has(review.agencyId)) throw new Error(`Duplicate audit agency: ${review.agencyId}`);
  const sourceType = 'system_map';
  const record = {
    auditOrder: audit.records.length + 1,
    agencyId: review.agencyId,
    agencyName: review.agencyName,
    country: review.country,
    region: review.region,
    status: review.status,
    mapCandidates: [{ url: review.url, sourceType, localFile: review.localFile ?? null }],
    preservedFiles: review.localFile ? [review.localFile] : [],
    mapDate: null,
    mapPageOrSection: review.section,
    exactMapWording: review.exact ?? null,
    thresholdMinutes: review.rep ?? null,
    thresholdText: review.thresholdText ?? null,
    serviceSpan: null,
    days: null,
    geography: null,
    mode: null,
    evidenceNotes: review.notes,
    reviewBatch: 2,
    evidenceSourceType: sourceType,
    reviewSources: [{ url: review.url, sourceType, localFile: review.localFile ?? null }],
    definitions: review.status === 'numeric_definition_on_map' || review.status === 'qualitative_definition_on_map'
      ? [{ id: 'primary', label: review.exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: review.rep ?? null, thresholdText: review.thresholdText ?? null, representative: true, sourceType, sourceUrl: review.url, localFile: review.localFile ?? null, mapPageOrSection: review.section, exactWording: review.exact ?? null, evidenceNotes: review.notes }]
      : [],
    representativeThresholdMinutes: review.rep ?? null,
    publishedFrequencyBands: null,
  };
  audit.records.push(record);
}

audit.scope = 'First 50 agencies plus 20 additional agencies reviewed individually against current official system maps on September 18, 2026.';
audit.updatedAt = '2026-09-18';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${reviews.length} additional manual reviews.`);
