import fs from 'fs';
import path from 'path';
import { r2Put } from './r2.js';
import { bumpPublicDataVersion } from './dataVersion.js';

const manifestPath = path.resolve('tmp/atlas-release-manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing ${manifestPath}; run build-pmtiles and verify coverage first.`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.releaseId || !manifest.pmtilesKey || !manifest.overviewPmtilesKey || !manifest.agencyPrefix) {
  throw new Error(`Invalid release manifest at ${manifestPath}.`);
}

await r2Put('atlas/release.json', JSON.stringify(manifest, null, 2));
await bumpPublicDataVersion(`release ${manifest.releaseId}`);
console.log(`Published Atlas data release ${manifest.releaseId}.`);
