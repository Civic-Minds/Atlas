import fs from 'node:fs';

// Second duplicate pass for the system-map audit (2026-10-11). The first pass
// (normalize-frequent-service-audit.mjs) merged aliases by hand; this pass merges
// every remaining pair of records that resolve to the same Atlas registry agency in
// docs/research/frequent-service-research-2026-09/atlas-agency-map.json, so the
// beta frequent-service story counts each agency once.

const auditPath = 'docs/research/system-map-audit-2026-09/data.json';
const mapPath = 'docs/research/frequent-service-research-2026-09/atlas-agency-map.json';

// Pairs whose two records disagree on status. Each entry names the record whose
// status is kept and why; the merged record is marked conflictingSources.
const STATUS_RESOLUTION = {
  yrt: { keep: 'york-region', reason: 'The two reviews read different official maps: the YRT Frequent Transit Network map names the network (no number); the general system map does not. The network map is current official evidence, so the qualitative definition stands.' },
  'rtd-denver': { keep: 'rtd-denver-batch3', reason: 'One review found no downloadable map; a later review read the current rider map and found no frequent definition. The reviewed map is the stronger evidence.' },
  burlington: { keep: 'burlington', reason: 'The system map publishes frequency bands without a named frequent category; the numeric record came from a single-route guide (Route 1). Narrower result kept: no network definition on the map.' },
  cincinnatimetro: { keep: 'cincinnati-metro', reason: 'Both reviews read the same map legend ("15 Minutes Or Better; 20-35 Minutes; ..."). These are unnamed frequency bands, so under the audit rule (a named frequent category is required) the narrower result is kept.' },
  gcrta: { keep: 'rta-cleveland', reason: 'The later record counted the legend bands "15 min or better; 30 min; 40-45; 60" as a definition; they are unnamed frequency bands, so under the audit rule the narrower result is kept.' },
  cdta: { keep: 'cdta-albany', reason: 'One review found only a 2016-17 PDF; the other read current CDTA map material with no frequent definition. The current material wins.' },
};

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const agencyMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const byId = new Map(audit.records.map(record => [record.agencyId, record]));

const uniqueBy = items => {
  const seen = new Set();
  return items.filter(item => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const removed = new Set();
for (const { slug, agencyIds } of agencyMap.auditDuplicates) {
  const records = agencyIds.map(id => byId.get(id));
  if (records.some(record => !record)) throw new Error(`Missing audit record for ${slug}: ${agencyIds.join(', ')}`);
  const statuses = new Set(records.map(record => record.status));
  const resolution = STATUS_RESOLUTION[slug];
  if (statuses.size > 1 && !resolution) throw new Error(`Status conflict without a resolution: ${slug}`);
  const keepId = resolution?.keep ?? (agencyIds.includes(slug) ? slug : records.sort((a, b) => a.auditOrder - b.auditOrder)[0].agencyId);
  const keep = byId.get(keepId);
  for (const other of records.filter(record => record !== keep)) {
    keep.mapCandidates = uniqueBy([...(keep.mapCandidates ?? []), ...(other.mapCandidates ?? [])]);
    keep.reviewSources = uniqueBy([...(keep.reviewSources ?? []), ...(other.reviewSources ?? [])]);
    keep.preservedFiles = [...new Set([...(keep.preservedFiles ?? []), ...(other.preservedFiles ?? [])])];
    keep.mergedAgencyIds = [...new Set([...(keep.mergedAgencyIds ?? []), other.agencyId, ...(other.mergedAgencyIds ?? [])])];
    keep.agencyAliases = [...new Set([...(keep.agencyAliases ?? []), other.agencyName, ...(other.agencyAliases ?? [])])].filter(name => name !== keep.agencyName);
    keep.evidenceNotes = [keep.evidenceNotes, `Merged duplicate record ${other.agencyId} (${other.status}): ${other.evidenceNotes ?? ''}`]
      .filter(Boolean).join(' ');
    keep.reviewBatch = Math.min(keep.reviewBatch ?? Infinity, other.reviewBatch ?? Infinity);
    removed.add(other.agencyId);
  }
  keep.atlasSlug = slug;
  if (statuses.size > 1) {
    keep.conflictingSources = true;
    keep.conflictResolution = resolution.reason;
  }
}

// One-to-many and one-to-one registry links for every remaining record.
const slugsById = new Map(agencyMap.records.filter(row => row.source === 'audit').map(row => [row.agencyId, row.slugs]));
audit.records = audit.records
  .filter(record => !removed.has(record.agencyId))
  .map((record, index) => ({ ...record, auditOrder: index + 1, atlasSlugs: slugsById.get(record.agencyId) ?? [] }))
  .map(({ atlasSlug, ...record }) => record);

audit.scope = `${audit.records.length} unique agencies reviewed individually against current official system maps or approved rider guides on September 18–19, 2026. Duplicate records for the same Atlas agency were merged on 2026-10-11.`;
audit.updatedAt = '2026-10-11';
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Merged ${removed.size} duplicate records; ${audit.records.length} unique audit records remain.`);
