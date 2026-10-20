import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const has = name => process.argv.includes(`--${name}`);
const root = resolve(import.meta.dirname, '..');
const bundleCatalogPath = resolve(arg('bundle-catalog') ?? 'data/derived/us-service-bundles.json');
const findingsPath = resolve(arg('findings') ?? 'catalog/findings.json');
const statusPath = resolve(arg('status') ?? 'data/derived/us-rollout-status.json');
const batchSize = Number(arg('batch-size') ?? 4);
if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('--batch-size must be a positive integer');

const bundleCatalog = JSON.parse(await readFile(bundleCatalogPath, 'utf8'));
const findings = JSON.parse(await readFile(findingsPath, 'utf8'));
const existing = new Set(findings.findings.filter(item => item.report?.startsWith('output/us-bundles/')).map(item => item.report.match(/output\/us-bundles\/([^/]+)/)?.[1]).filter(Boolean));
const status = await (async () => { try { return JSON.parse(await readFile(statusPath, 'utf8')); } catch { return { bundles: {} }; } })();
const requested = has('all-remaining') ? bundleCatalog.bundles.filter(bundle => !existing.has(bundle.id)).map(bundle => bundle.id) : (arg('bundles') ?? '').split(',').map(value => value.trim()).filter(Boolean);
if (!requested.length) throw new Error('No bundles selected; use --all-remaining or --bundles ID,ID');

const script = fileURLToPath(new URL('./run-us-bundle.mjs', import.meta.url));
const forwarded = [];
for (let i = 2; i < process.argv.length; i++) {
  const value = process.argv[i];
  if (value === '--bundles' || value === '--all-remaining' || value === '--batch-size' || value === '--status' || value === '--findings' || value === '--bundle-catalog') { if (value !== '--all-remaining') i++; continue; }
  forwarded.push(value);
}

const writeStatus = async () => { status.updatedAt = new Date().toISOString(); await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`); };
const runBundle = bundleId => new Promise((resolveRun, reject) => {
  const child = spawn(process.execPath, ['--max-old-space-size=8192', script, '--bundle', bundleId, ...forwarded], { stdio: 'inherit' });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolveRun() : reject(new Error(`${bundleId} exited with ${code}`)));
});
const catalogBundle = async bundleId => {
  const reportPath = `output/us-bundles/${bundleId}/coverage-report.json`;
  const provenancePath = `output/us-bundles/${bundleId}/provenance.json`;
  const report = JSON.parse(await readFile(resolve(root, reportPath), 'utf8'));
  const id = `us-bundle-${bundleId}-30-minute`;
  const entry = { id, headwayMinutes: 30, selectedCmas: report.scope.selectedCmaCount, agenciesChecked: report.scope.agencyCount, populationInSelectedCmas: report.scope.atlasCoveragePopulation, coveredPopulation: report.scope.coveredPopulation, coveredPercent: Number(report.scope.coveredPercent.toFixed(2)), populationVintage: 2020, populationGeography: 'US Census block groups', note: 'Automated sequential run with a 0.1-degree walking-network buffer around each qualifying agency footprint.', report: reportPath, map: `output/us-bundles/${bundleId}/coverage-map.geojson`, cityTable: `output/us-bundles/${bundleId}/coverage-by-cma.csv`, provenance: provenancePath };
  findings.findings = findings.findings.filter(item => item.id !== id); findings.findings.push(entry);
  await writeFile(findingsPath, `${JSON.stringify(findings, null, 2)}\n`);
};
const skippedBundle = async bundleId => {
  try { await readFile(resolve(root, `output/us-bundles/${bundleId}/skipped.json`), 'utf8'); return true; } catch { return false; }
};

for (let offset = 0; offset < requested.length; offset += batchSize) {
  const batch = requested.slice(offset, offset + batchSize);
  console.log(`Starting batch ${Math.floor(offset / batchSize) + 1}: ${batch.join(', ')}`);
  for (const bundleId of batch) {
    status.bundles[bundleId] = { status: 'running', startedAt: new Date().toISOString() }; await writeStatus();
    try {
      await runBundle(bundleId);
      if (await skippedBundle(bundleId)) status.bundles[bundleId] = { status: 'skipped', completedAt: new Date().toISOString(), artifact: `output/us-bundles/${bundleId}/skipped.json` };
      else { await catalogBundle(bundleId); status.bundles[bundleId] = { status: 'complete', completedAt: new Date().toISOString(), report: `output/us-bundles/${bundleId}/coverage-report.json` }; }
    } catch (error) {
      status.bundles[bundleId] = { status: 'failed', failedAt: new Date().toISOString(), error: error.message };
      console.error(`Bundle ${bundleId} failed; continuing with the queue.`);
    }
    await writeStatus();
  }
}

const failed = requested.filter(bundleId => status.bundles[bundleId]?.status === 'failed');
console.log(JSON.stringify({ requested: requested.length, complete: requested.length - failed.length, failed }, null, 2));
