import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const reviews = [
  ['oakville-transit', 'Oakville Transit', 'Canada', 'Ontario', 'numeric_definition_on_map', 'system_map', 'https://www.oakvilletransit.ca/getmedia/280bb767-50e9-4b50-8818-128a2eb2ba14/transit-system-map-september-2026.pdf', 'page 1, Bus Routes legend', 'Wider lines indicate more frequent service. During the mid-day, a bus comes every… 15 Minutes; 20 Minutes; 30 Minutes; 60 Minutes; Rush Hours Only.', 60, 'published 15-, 20-, 30-, and 60-minute bands; 60 minutes is the slowest published band', 'Official September 2026 Oakville Transit system map visually reviewed. The map explicitly connects line emphasis to more frequent service and publishes numeric bands; the slowest band is retained as representative.'],
  ['stlevis', 'Société de transport de Lévis', 'Canada', 'Quebec', 'numeric_definition_on_map', 'system_map', 'https://www.stlevis.ca/sites/default/files/public/assets/parcours/brochures/carte_reseau_e-2022.pdf', 'page 1 map legend', 'Lignes à haute fréquence (parcours Lévisien). Service fréquent aux 30 minutes (ou mieux) sur chacun des axes structurants du réseau, jusqu’à 23h00 en semaine.', 30, 'every 30 minutes or better, until 11 p.m. weekdays', 'Official STLévis network map visually reviewed. It names high-frequency lines and gives the threshold and weekday span.'],
  ['sttr-trois-rivieres', 'Société de transport de Trois-Rivières', 'Canada', 'Quebec', 'no_definition_on_map', 'rider_guide', 'https://sttr.qc.ca/app/uploads/2021/08/sttr-guide-initiation-vf.pdf', 'page 13, Questions fréquemment posées', 'De façon générale, la fréquence est de 35 minutes en semaine pendant le jour et de 65 minutes les soirs et les fins de semaine.', null, null, 'Official STTR rider guide visually reviewed. It gives general intervals but does not name a frequent/high-frequency category.'],
  ['vbz-zurich', 'VBZ Zürich', 'Switzerland', 'Zurich', 'no_definition_on_map', 'system_map', 'https://www.zvv.ch/content/dam/fahrgastinfo/netzpl%C3%A4ne/stadt-zuerich.pdf', 'city network map legend', 'Tram; Bus; S-Bahn; Cable car/funicular; boat.', null, null, 'Official 2026 Zurich city network map visually reviewed. It identifies modes but no frequent-service definition.'],
  ['vasttrafik-goteborg', 'Västtrafik Göteborg', 'Sweden', 'Västra Götaland', 'no_definition_on_map', 'system_map', 'https://www.vasttrafik.se/globalassets/media/kartor/linjenatskartor/sparvagn/sparvagn_stombuss_bat_juni_2026.pdf', 'June 2026 tram, trunk-bus and ferry map', 'TRAM LINES, TRUNK BUS LINES AND FERRIES; Stombussar/Trunk buses.', null, null, 'Official Västtrafik map visually reviewed. It labels trunk buses but gives no frequent-service threshold.'],
  ['de-lijn-antwerp', 'De Lijn Antwerp', 'Belgium', 'Antwerp', 'no_definition_on_map', 'system_map', 'https://assets.ctfassets.net/32fmeyn9t08i/1VjEPfZ9lyf3MBie4MqR9d/dfb45cf19051d5a34bb1aef0f602d988/A1_Netplannen_VVR_20260701_Antwerpen.pdf', 'network map legend, valid July 1, 2026', 'BUSLIJNEN; TRAMLIJNEN; Snelbus.', null, null, 'Official De Lijn Antwerp map visually reviewed. It distinguishes bus, tram, and express bus but no frequent-service definition.'],
  ['oasa-athens', 'OASA Athens', 'Greece', 'Athens', 'no_definition_on_map', 'rider_guide', 'https://www.oasa.gr/wp-content/uploads/2023/04/Transport-for-Athens_tousrist_pocket_map_GR.pdf', 'official tourist pocket map', null, null, null, 'Official OASA pocket map visually reviewed. It shows metro, tram, bus, trolleybus, and airport express services but no frequent-service definition.'],
  ['metrovalencia', 'Metrovalencia', 'Spain', 'Valencia', 'map_unavailable', 'system_map', 'https://www.metrovalencia.es/wp-content/uploads/2025/02/Plan-movilidad-FASE4-Metro-zonaNorte-a-ValenciaSud-y-nuevas-conexiones-BusMetro-zonaSur-.pdf', 'provisional network map', 'Mapa provisional; lines will be updated as services become operational.', null, null, 'The latest located official map is explicitly provisional and not current enough for this audit; no current map was accepted.'],
  ['bangkok-mrt', 'Bangkok MRT / BEM', 'Thailand', 'Bangkok', 'no_definition_on_map', 'system_map', 'https://metro.bemplc.co.th/MRT-System-Map?lang=en', 'official MRT route map', 'Route Map; Download Route Map of MRT Blue Line and MRT Purple Line.', null, null, 'Official Bangkok MRT route map visually reviewed. It identifies lines, stations, and interchanges but no frequent-service definition.'],
  ['daejeon-metro', 'Daejeon Metro', 'South Korea', 'Daejeon', 'no_definition_on_map', 'system_map', 'https://www.djtc.kr/kor/page.do?menuIdx=39', 'English route map', '노선도 / Route Map; Line 1 station network and interchange symbols.', null, null, 'Official Daejeon route map visually reviewed. It shows the station network but no frequent-service definition.'],
  ['taichung-metro', 'Taichung Metro', 'Taiwan', 'Taichung', 'no_definition_on_map', 'system_map', 'https://www.tmrt.com.tw/metro-life/map', 'Green Line route map', '台中捷運綠線路線圖 / TMRT Green Line Route Map.', null, null, 'Official Taichung Metro map visually reviewed. It identifies route and station symbols but no frequent-service definition.'],
  ['shenzhen-metro', 'Shenzhen Metro', 'China', 'Shenzhen', 'no_definition_on_map', 'system_map', 'https://www.szmc.net/SMARTC/upload/file/20250627/1750986736853070484.pdf', '2025 network map legend', 'Lines 1–20; tram; SkyShuttle; transfer stations; ordinary stations; railway station; airport.', null, null, 'Official Shenzhen Metro network map visually reviewed. It identifies modes, lines, and transfer symbols but no frequent-service definition.'],
  ['maha-mumbai-metro', 'Maha Mumbai Metro', 'India', 'Mumbai', 'no_definition_on_map', 'system_map', 'https://www.mmmocl.co.in/project-brief.html', 'Map of Metro Network', 'Map of Metro Network.', null, null, 'Official Maha Mumbai Metro network map visually reviewed. It shows lines, stations, and network totals but no frequent-service definition.'],
];

const existing = new Set(audit.records.map(record => record.agencyId));
const oakville = audit.records.find(record => record.agencyId === 'oakville-transit');
if (oakville) {
  oakville.status = 'numeric_definition_on_map';
  oakville.mapPageOrSection = 'page 1, Bus Routes legend';
  oakville.exactMapWording = 'Wider lines indicate more frequent service. During the mid-day, a bus comes every… 15 Minutes; 20 Minutes; 30 Minutes; 60 Minutes; Rush Hours Only.';
  oakville.thresholdMinutes = 60;
  oakville.thresholdText = 'published 15-, 20-, 30-, and 60-minute bands; 60 minutes is the slowest published band';
  oakville.evidenceNotes = 'Official September 2026 Oakville Transit system map visually reviewed again. The map explicitly connects line emphasis to more frequent service and publishes numeric bands; the slowest band is retained as representative.';
  oakville.reviewBatch = 18;
  oakville.definitions = [{ id: 'primary', label: 'More frequent service bands', thresholdMinutes: 60, thresholdText: oakville.thresholdText, representative: true, sourceType: 'system_map', sourceUrl: 'https://www.oakvilletransit.ca/getmedia/280bb767-50e9-4b50-8818-128a2eb2ba14/transit-system-map-september-2026.pdf', localFile: null, mapPageOrSection: oakville.mapPageOrSection, exactWording: oakville.exactMapWording, evidenceNotes: oakville.evidenceNotes }];
  oakville.representativeThresholdMinutes = 60;
}
let inserted = 0;
for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, rep, thresholdText, notes] of reviews) {
  if (existing.has(agencyId)) continue;
  const qualifies = status === 'numeric_definition_on_map' || status === 'qualitative_definition_on_map';
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, agencyName, country, region, status,
    mapCandidates: [{ url, sourceType, localFile: null }], preservedFiles: [], mapDate: null,
    mapPageOrSection: section, exactMapWording: exact, thresholdMinutes: rep, thresholdText,
    serviceSpan: null, days: null, geography: null, mode: null, evidenceNotes: notes, reviewBatch: 18,
    evidenceSourceType: sourceType, reviewSources: [{ url, sourceType, localFile: null }],
    definitions: qualifies ? [{ id: 'primary', label: exact?.split('—')[0]?.trim() ?? 'Named frequency service', thresholdMinutes: rep, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null, mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }] : [],
    representativeThresholdMinutes: rep, publishedFrequencyBands: null,
  });
  inserted += 1;
}

audit.scope = 'First 50 agencies plus 201 additional agencies reviewed individually against current official system maps or approved rider guides on September 19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Recorded ${inserted} additional manual reviews.`);
