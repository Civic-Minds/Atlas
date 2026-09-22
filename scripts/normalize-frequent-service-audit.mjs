import fs from 'node:fs';

const auditPath = 'docs/research/system-map-audit-2026-09.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const canonicalByDuplicate = {
  'bctransit-victoria': 'victoria',
  octranspo: 'ottawa',
  'metro-st-paul': 'minneapolis-metro',
  cota: 'cota-columbus',
  jta: 'jta-jacksonville',
  capmetro: 'capmetro-austin',
  valleymetro: 'valley-metro-phoenix',
  fax: 'fresno-fax',
  grtc: 'richmond-grtc',
  'sun-tran': 'sun-tran-tucson',
  rgrta: 'rts-rochester',
  cincinnatimetro: 'sorta-cincinnati',
  dash: 'dash-alexandria',
  bigbluebus: 'big-blue-bus',
};

const byId = new Map(audit.records.map(record => [record.agencyId, record]));
const mergedIds = new Set();
const uniqueBy = items => {
  const seen = new Set();
  return items.filter(item => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

for (const [duplicateId, canonicalId] of Object.entries(canonicalByDuplicate)) {
  const canonical = byId.get(canonicalId);
  const duplicate = byId.get(duplicateId);
  if (!canonical || !duplicate) throw new Error(`Missing merge record: ${canonicalId} / ${duplicateId}`);
  if (canonical.country !== duplicate.country) throw new Error(`Country mismatch: ${canonicalId} / ${duplicateId}`);

  canonical.mapCandidates = uniqueBy([...(canonical.mapCandidates ?? []), ...(duplicate.mapCandidates ?? [])]);
  canonical.reviewSources = uniqueBy([...(canonical.reviewSources ?? []), ...(duplicate.reviewSources ?? [])]);
  canonical.preservedFiles = [...new Set([...(canonical.preservedFiles ?? []), ...(duplicate.preservedFiles ?? [])])];
  canonical.definitions = uniqueBy([...(canonical.definitions ?? []), ...(duplicate.definitions ?? [])])
    .map((definition, index) => ({ ...definition, representative: index === 0 }));
  canonical.mergedAgencyIds = [...new Set([...(canonical.mergedAgencyIds ?? []), duplicateId, ...(duplicate.mergedAgencyIds ?? [])])];
  canonical.agencyAliases = [...new Set([...(canonical.agencyAliases ?? []), duplicate.agencyName, ...(duplicate.agencyAliases ?? [])])];
  canonical.evidenceNotes = [canonical.evidenceNotes, `Merged supporting record ${duplicateId}: ${duplicate.evidenceNotes ?? ''}`]
    .filter(Boolean).join(' ');
  canonical.reviewBatch = Math.min(canonical.reviewBatch ?? Infinity, duplicate.reviewBatch ?? Infinity);
  mergedIds.add(duplicateId);
}

audit.records = audit.records
  .filter(record => !mergedIds.has(record.agencyId))
  .map(record => ({
    ...record,
    canonicalAgencyId: record.agencyId,
    mergedAgencyIds: record.mergedAgencyIds ?? [],
    agencyAliases: record.agencyAliases ?? [],
  }))
  .map((record, index) => ({ ...record, auditOrder: index + 1 }));

audit.scope = 'First 50 agencies plus 272 additional unique agencies reviewed individually against current official system maps or approved rider guides on September 18–19, 2026.';
audit.updatedAt = '2026-09-19';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Merged ${mergedIds.size} duplicate records; ${audit.records.length} unique audit records remain.`);
