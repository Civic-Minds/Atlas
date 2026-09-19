import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const existing = new Set(audit.records.map(record => record.agencyId));

const reviews = [
  ['dijon', 'DiviaMobilités Dijon', 'France', 'Bourgogne-Franche-Comté', 'numeric_definition_on_map', 'rider_guide', 'https://static.divia.fr/pdf/documents-voyageurs/guide-bus-tram.pdf', 'page 4, Votre réseau Bus&Tram', '7 Lianes; De 5h00 à 1h00 avec un voyage toutes les 5min à 15min en heures de pointe.', 15, '5–15 minutes in peak periods', '05:00–01:00', 'every day', 'Official DiviaMobilités rider guide visually reviewed.', 'Lianes'],
  ['tours', 'Fil Bleu Tours', 'France', 'Centre-Val de Loire', 'numeric_definition_on_map', 'rider_guide', 'https://www.filbleu.fr/services/le-reseau-bus-tram', 'Le réseau Fil Bleu', '2 lignes à haut niveau de service; un bus ou un tram tous les 6 à 10 minutes entre 7h et 20h.', 10, '6–10 minutes', '07:00–20:00 frequency window; 05:00–00:30 network span', '7 days; weekdays span specified', 'Official Fil Bleu network guide visually reviewed.', 'High-level-of-service lines'],
  ['rennes', 'STAR Rennes', 'France', 'Brittany', 'numeric_definition_on_map', 'rider_guide', 'https://www.star.fr/reseau-star/bus-metro/ligne/c4', 'C4 rider page, Informations pratiques; Chronostar FAQ', 'Les CHRONOSTAR sont des bus à haut niveau de service; fréquence élevée; C4 runs 8–10 minutes, 07:00–19:00 weekdays.', 10, '8–10 minutes', '07:00–19:00 for C4; broader Chronostar span from 05:15 to 01:45 Thu–Sat', 'daily with adapted Sunday/holiday schedules', 'Official STAR rider information visually reviewed.', 'Chronostar'],
  ['montpellier', 'TaM Montpellier', 'France', 'Occitanie', 'numeric_definition_on_map', 'rider_guide', 'https://bustram.montpellier3m.fr/app/uploads/2025/06/TAM-bustram-ligneA-depliant_A4-8-pages-v16-WEB-planches-1.pdf', 'pages 2–3, Bustram A', 'Le bustram, un bus à haut niveau de service; toutes les 10 min en journée en cœur de métropole, toutes les 15 min en périphérie; 45 min Sundays/holidays.', 45, '10 minutes core, 15 minutes periphery, 45 minutes Sundays/holidays', 'service generally 05:00–00:00', 'weekdays, Saturday, Sundays/holidays', 'Official TaM Bustram rider guide visually reviewed. The slowest published period is used as the representative threshold.', 'Bustram'],
  ['lens', 'TADAO / Artois Mobilités', 'France', 'Hauts-de-France', 'numeric_definition_on_map', 'rider_guide', 'https://www.tadao.fr/fr/vax-Le-reseau.html', 'network guide, Les Bulles', '9 lignes rapides avec des fréquences comprises entre 10 et 30 minutes; Les lignes Bulles sont des lignes BHNS.', 30, '10–30 minutes', 'large year-round operating span; exact hours not stated', null, 'Official TADAO rider-facing network guide visually reviewed.', 'Bulles rapid lines'],
  ['metro-de-panama', 'Metro de Panamá', 'Panama', 'Panama', 'numeric_definition_on_map', 'rider_guide', 'https://www.elmetrodepanama.com/wp-content/uploads/2023/03/Guia-de-Bolsillo-Ramal-ES.pdf', 'one-page guide, GUÍA section', 'Aquí aborda el tren disponible cada 10 minutos.', 10, 'every 10 minutes', '05:00–23:00 weekdays; 05:00–22:00 Saturday; 07:00–22:00 Sunday/holidays', 'daily', 'Official Metro de Panamá pocket guide visually reviewed.', 'Metro service'],
];

for (const [agencyId, agencyName, country, region, status, sourceType, url, section, exact, threshold, thresholdText, serviceSpan, days, notes, label] of reviews) {
  if (existing.has(agencyId)) continue;
  const source = { url, sourceType, localFile: null };
  audit.records.push({
    auditOrder: audit.records.length + 1, agencyId, canonicalAgencyId: agencyId, agencyName, country, region, status,
    mapCandidates: [source], preservedFiles: [], mapDate: null, mapPageOrSection: section, exactMapWording: exact,
    thresholdMinutes: threshold, thresholdText, serviceSpan, days, geography: null, mode: null, evidenceNotes: notes,
    reviewBatch: 30, evidenceSourceType: sourceType, reviewSources: [source], definitions: [{ id: 'frequent', label,
      thresholdMinutes: threshold, thresholdText, representative: true, sourceType, sourceUrl: url, localFile: null,
      mapPageOrSection: section, exactWording: exact, evidenceNotes: notes }], representativeThresholdMinutes: threshold,
    publishedFrequencyBands: null, mergedAgencyIds: [], agencyAliases: [],
  });
}

audit.records = audit.records.map((record, index) => ({ ...record, auditOrder: index + 1 }));
audit.scope = 'First 50 agencies plus 287 additional unique agencies reviewed individually against current official system maps or approved rider guides on September 18–19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log('Recorded batch 30.');
