/**
 * Check config/on-demand source files before they're committed (CIV-50): structure, then the zone
 * gate on each service by itself. Reads only local files.
 *
 *   npx tsx pipeline/check-on-demand-sources.ts            # every file
 *   npx tsx pipeline/check-on-demand-sources.ts lawrence-ku cats
 */
import { evaluateOnDemandRelease } from './onDemandGate.js';
import { buildOnDemandRelease } from '../src/data/onDemandExport.js';
import { loadOnDemandSources } from '../src/data/onDemandSources.js';

const only = new Set(process.argv.slice(2));
let sources;
try {
  sources = loadOnDemandSources();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const picked = sources.filter(s => only.size === 0 || only.has(s.slug));
const release = buildOnDemandRelease('beta', undefined, undefined, picked);
const slugs = new Set(picked.map(s => s.slug));
const index = { ...release.index, services: release.index.services.filter(s => slugs.has(s.slug)) };
const geometries = new Map(release.geometries.filter(g => slugs.has(g.slug)).map(g => [g.slug, g]));
const findings = evaluateOnDemandRelease({ index, geometries }, null, { audience: 'beta', promoted: new Set() });
for (const s of index.services) {
  const g = geometries.get(s.slug)!;
  console.log(`${s.slug}: ${g.features.length} zones, ${g.stopFeatures?.length ?? 0} stops`);
}
for (const f of findings) console.log(`  ${f.severity === 'red' ? 'RED   ' : 'yellow'} ${f.slug} ${f.flag}: ${f.detail}`);
console.log(findings.some(f => f.severity === 'red') ? 'FAIL' : `OK (${picked.length} sources)`);
if (findings.some(f => f.severity === 'red')) process.exitCode = 1;
