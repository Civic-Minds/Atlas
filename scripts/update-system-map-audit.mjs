import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviewed = {
  'translink-vancouver': {
    status: 'numeric_definition_on_map', mapCandidates: [{ label: 'Frequent Transit Network map', url: 'https://maps.translink.ca/-/media/translink/documents/schedules-and-maps/transit-system-maps/system-maps/frequent_transit_network_of_metro_vancouver_map.pdf', sourceType: 'system_map', localFile: 'translink-vancouver-1' }], preservedFiles: ['translink-vancouver-1'], mapDate: 'Effective September 2025', mapPageOrSection: 'page 1, map legend', exactMapWording: 'The Frequent Transit Network (FTN) is a network of corridors that have transit service every 15 minutes or better', thresholdMinutes: 15, thresholdText: 'every 15 minutes or better', serviceSpan: '6 a.m. weekdays; 7 a.m. Saturday; 8 a.m. Sunday; until 9 p.m. daily', days: '7 days', geography: 'corridor/network', mode: 'bus and SkyTrain', evidenceNotes: 'The preserved official FTN map directly states the 15-minute-or-better definition and shows the service span in the map legend.'
  },
  'stm-montreal': {
    status: 'no_definition_on_map', mapCandidates: [{ label: 'STM network map 2026', url: 'https://www.stm.info/sites/default/files/media/Stminfo/images/plan_reseau.pdf', sourceType: 'system_map', localFile: 'stm-montreal-1' }], preservedFiles: ['stm-montreal-1'], mapDate: '2026', mapPageOrSection: 'network map legend', evidenceNotes: 'The current official network map was preserved and reviewed. It identifies the network but does not publish a named frequent/high-frequency category or numeric frequent threshold.'
  },
  septa: {
    status: 'qualitative_definition_on_map', mapCandidates: [{ label: 'Metro and Frequent Bus Network', url: 'https://wwww.septa.org/wp-content/uploads/page/communication/SEPTA_System-Map_v3-0.pdf', sourceType: 'system_map', localFile: 'septa-2' }], preservedFiles: ['septa-1', 'septa-2'], mapDate: 'February 2025', mapPageOrSection: 'page 1, map legend', exactMapWording: 'Frequent Bus Routes', geography: 'route/network', mode: 'bus', evidenceNotes: 'The preserved official Metro and Frequent Bus Network map labels Frequent Bus Routes but does not state a numeric headway on the map itself. The 15-minute standard remains outside this map-only record.'
  },
  victoria: {
    status: 'numeric_definition_on_map', mapCandidates: [{ label: 'Victoria Regional map', url: 'https://www.bctransit.com/victoria/wp-content/uploads/sites/49/2026/09/vic_rg_sept2026_v2.pdf', sourceType: 'system_map', localFile: 'victoria-2' }], preservedFiles: ['victoria-1', 'victoria-2'], mapDate: 'September 2026', mapPageOrSection: 'map legend and Frequent Route inset', exactMapWording: 'Frequent Route — 15 minute or better service 7:00 a.m.–7:00 p.m., Mon–Fri', thresholdMinutes: 15, thresholdText: '15 minute or better service', serviceSpan: '7 a.m.–7 p.m.', days: 'Monday–Friday', geography: 'route', mode: 'bus', evidenceNotes: 'The current official Victoria regional map directly defines Frequent Route in its legend and repeats the 15-minute-or-better span in the route inset.'
  },
  'miami-dade-transit': {
    status: 'no_definition_on_map', mapCandidates: [{ label: 'Metrobus System Map', url: 'https://www.miamidade.gov/resources/transportation_publicworks/documents/system-maps-web.pdf', sourceType: 'system_map', localFile: 'miami-dade-transit-1' }], preservedFiles: ['miami-dade-transit-1'], mapDate: 'April 2026', mapPageOrSection: 'page 1, frequency legend', exactMapWording: '10 minutes or less; 15 minutes; 20 minutes; 30 minutes; 60 minutes', evidenceNotes: 'The current official system map publishes midday frequency bands and notes that routes can combine for higher frequency, but it does not name a Frequent or High-Frequency category.'
  },
  'sound-transit': {
    status: 'no_definition_on_map', mapCandidates: [{ label: 'Current Sound Transit service map', url: 'https://www.soundtransit.org/sites/default/files/documents/st-current-service-map.pdf', sourceType: 'system_map', localFile: 'sound-transit-1' }], preservedFiles: ['sound-transit-1'], mapDate: 'September 2026', mapPageOrSection: 'page 1, map legend', evidenceNotes: 'The current official service map identifies Link, Sounder, and ST Express services but does not name a frequent/high-frequency category or publish a frequent threshold.'
  },
  ttc: {
    status: 'numeric_definition_on_map', mapDate: 'September 2025', mapPageOrSection: 'page 1, map legend', exactMapWording: '10-Minute Network', thresholdMinutes: 10, thresholdText: '10-Minute Network', serviceSpan: '6 a.m.–1 a.m. Monday–Saturday; Sunday starts later', days: '7 days', geography: 'network', mode: 'bus and rail', evidenceNotes: 'The system-map legend visibly identifies the 10-Minute Network and its operating span.',
  },
  calgary: {
    status: 'no_definition_on_map', mapDate: '2025', mapPageOrSection: 'page 1, map legend', evidenceNotes: 'The system-map legend lists CTrain, MAX, regular/express routes, and BRT, but no named frequent/high-frequency definition or threshold.',
  },
  edmonton: {
    status: 'qualitative_definition_on_map', mapDate: 'May 2025', mapPageOrSection: 'page 1, map legend', exactMapWording: 'Frequent Route', evidenceNotes: 'The map legend names a Frequent Route but does not publish a numeric threshold beside the label.',
  },
  kingcountymetro: {
    status: 'numeric_definition_on_map', mapDate: 'September 2024', mapPageOrSection: 'page 1, map legend', exactMapWording: 'frequent all-day route (every 15 minutes or less until 6pm Mon–Fri)', thresholdMinutes: 15, thresholdText: 'every 15 minutes or less until 6pm Mon–Fri', serviceSpan: 'until 6 p.m.', days: 'Monday–Friday', geography: 'route', mode: 'bus', evidenceNotes: 'The system-map legend directly attaches the 15-minute threshold to the frequent all-day route symbol.',
  },
  ottawa: {
    status: 'numeric_definition_on_map', mapDate: 'April 2025', mapPageOrSection: 'page 1, map legend', exactMapWording: 'Frequent • Fréquent — Service every 15 minutes or less on weekdays 06:00 to 18:00', thresholdMinutes: 15, thresholdText: 'Service every 15 minutes or less on weekdays 06:00 to 18:00', serviceSpan: '06:00–18:00', days: 'weekdays', geography: 'network map routes', mode: 'bus', evidenceNotes: 'The bilingual map legend directly defines the Frequent category and its 15-minute weekday period.',
  },
  'york-region': {
    status: 'qualitative_definition_on_map', mapDate: 'May 2025', mapPageOrSection: 'page 1, map title and legend', exactMapWording: 'FREQUENT TRANSIT NETWORK', evidenceNotes: 'The map names a Frequent Transit Network and FTN tiers but does not state a numeric headway threshold.',
  },
  burlington: {
    status: 'no_definition_on_map', mapDate: 'November 2025', mapPageOrSection: 'page 1, frequency legend', exactMapWording: 'Every 15 minutes or better daytime; Every 15 minutes or better peak; Every 30 minutes or better off-peak; Every 30–60 minutes or better; Every 45 minutes', evidenceNotes: 'The map publishes numeric frequency bands, but the reviewed legend does not name a Frequent or High-Frequency category. Retain as numeric service context, not a named frequent definition.',
  },
  'la-metro': {
    status: 'numeric_definition_on_map', mapCandidates: [{ label: 'Frequent Service Network', url: 'https://cdn.beta.metro.net/wp-content/uploads/2026/05/04165451/26-1718_SysOverview_HiFreq_online_DCR.pdf', sourceType: 'system_map', localFile: 'la-metro-2' }], preservedFiles: ['la-metro-1', 'la-metro-2'], mapDate: '2026', mapPageOrSection: 'page 1, map title and legend', exactMapWording: 'Frequent Service Network — operate every 15 minutes or less from 6am–6pm', thresholdMinutes: 15, thresholdText: '15 minutes or less from 6 a.m.–6 p.m.', serviceSpan: '6 a.m.–6 p.m.', days: 'not specified on reviewed map', geography: 'network', mode: 'bus', evidenceNotes: 'The official map is explicitly titled Frequent Service Network and states the 15-minute threshold in its legend.'
  },
  mbta: {
    status: 'numeric_definition_on_map', mapPageOrSection: 'official Frequent Bus Route Map page and map caption', exactMapWording: 'Frequent Bus Routes, which arrive every 15 minutes or better', thresholdMinutes: 15, thresholdText: 'every 15 minutes or better', geography: 'route/network', mode: 'bus', evidenceNotes: 'The preserved official MBTA map page identifies the map as Frequent Bus Route Map and its caption defines the routes as every 15 minutes or better.'
  },
  cta: {
    status: 'qualitative_definition_on_map', mapCandidates: [{ label: 'CTA system map brochure', url: 'https://www.transitchicago.com/assets/1/6/ctamap_SystemMap.pdf', sourceType: 'system_map', localFile: 'cta-1' }], preservedFiles: ['cta-1'], mapDate: 'August 2026', mapPageOrSection: 'page 1, map legend', exactMapWording: 'CTA frequent routes', geography: 'route/network', mode: 'bus', evidenceNotes: 'The official system-map legend includes a CTA frequent routes symbol, but the map does not define it with a numeric headway.'
  },
  winnipeg: {
    status: 'map_unavailable', mapCandidates: [{ label: 'Short Term Network Plan', url: 'https://info.winnipegtransit.com/assets/2793/Short_Term_Network_Plan.pdf', sourceType: 'planning_map', localFile: 'winnipeg-1' }], preservedFiles: ['winnipeg-1'], mapPageOrSection: 'page 1, planning-map legend', exactMapWording: 'Frequent Lines — Service every 10–15 minutes', thresholdText: 'Service every 10–15 minutes', geography: 'network', mode: 'bus', evidenceNotes: 'An official planning map was preserved, but it is not clearly a current rider-facing system map. It is retained for rechecking and excluded from the system-map chart until a current system map is verified.'
  },
  uta: {
    status: 'numeric_definition_on_map', mapDate: '2023', mapPageOrSection: 'map pages, route legend', exactMapWording: 'Frequent bus — Runs every 15 minutes', thresholdMinutes: 15, thresholdText: 'Runs every 15 minutes', serviceSpan: 'shown on map by route/product', days: 'shown on map by route/product', geography: 'route/network', mode: 'bus', evidenceNotes: 'The preserved official UTA map pages label Frequent bus and state Runs every 15 minutes. This is the map-facing definition; slower product-specific periods do not replace it.',
  },
};

for (const record of audit.records) {
  const review = reviewed[record.agencyId];
  if (review) Object.assign(record, review);
}

fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Updated ${Object.keys(reviewed).length} system-map audit records.`);
