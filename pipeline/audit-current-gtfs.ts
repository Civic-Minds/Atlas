#!/usr/bin/env npx tsx
/**
 * Read-only structural and identity audit of every production-visible agency's
 * newest archived GTFS ZIP (private archive bucket; the public gtfs/<slug>.zip
 * copies stopped updating in August 2026).
 */
import { readFileSync } from 'node:fs';
import './loadEnv.js';
import { parseGtfsZip } from './parseGtfs.js';
import { validateGtfs } from './validation.js';
import { r2GetArchiveBuffer, r2ListArchiveObjects } from './r2.js';
import { selectArchiveForAgency } from './archiveSelection.js';
import { isActiveProductionFeed } from '../shared/feedAvailability.js';
import {
  aggregateValidationIssues,
  summarizeCurrentFeed,
  type CurrentFeedAgency,
  type CurrentFeedFinding,
} from './currentFeedAudit.js';

interface RegistryAgency extends CurrentFeedAgency {
  staged?: boolean;
  hiddenInProduction?: boolean;
}

interface AuditResult {
  finding?: CurrentFeedFinding;
  missing?: string;
  parseError?: string;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function auditAgency(agency: RegistryAgency): Promise<AuditResult> {
  const prefix = `gtfs/archive/${agency.slug}/`;
  const selection = selectArchiveForAgency(await r2ListArchiveObjects(prefix), agency);
  if (!selection.ok) {
    return selection.noArchive
      ? { missing: `${prefix}*.zip` }
      : { parseError: `${agency.slug}: ${selection.reason}` };
  }
  const buffer = await r2GetArchiveBuffer(selection.key);
  if (!buffer) return { missing: selection.key };
  try {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    // Shape repair is intentionally audited separately: grouping every shape in
    // all 466 feeds makes this read-only inventory unnecessarily expensive.
    const gtfs = await parseGtfsZip(arrayBuffer);
    const fullValidation = validateGtfs(gtfs, agency.name ?? agency.slug);
    // The parser deliberately omitted shapes for this inventory pass, so do not
    // report the synthetic "shapes.txt missing" warning it would create.
    const finding = summarizeCurrentFeed(agency, buffer, gtfs, {
      ...fullValidation,
      warnings: fullValidation.warnings - fullValidation.issues.filter(issue => issue.code === 'W001').length,
      totalIssues: fullValidation.totalIssues - fullValidation.issues.filter(issue => issue.code === 'W001').length,
      issues: fullValidation.issues.filter(issue => issue.code !== 'W001'),
    });
    return { finding };
  } catch (error) {
    return { parseError: `${agency.slug}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function main(): Promise<void> {
  const index = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as { agencies: RegistryAgency[] };
  const requestedSlugs = new Set(process.argv.slice(2));
  const active = index.agencies.filter(agency =>
    isActiveProductionFeed(agency) && (requestedSlugs.size === 0 || requestedSlugs.has(agency.slug))
  );
  const results = await mapWithConcurrency(active, 2, auditAgency);
  const findings = results.flatMap(result => result.finding ? [result.finding] : []);
  const missing = results.flatMap(result => result.missing ? [result.missing] : []);
  const parseErrors = results.flatMap(result => result.parseError ? [result.parseError] : []);

  const duplicateHashes = Object.entries(Object.groupBy(findings, finding => finding.hash))
    .map(([hash, group]) => ({
      hash,
      slugs: group!.map(finding => finding.slug),
      agencyNames: [...new Set(group!.flatMap(finding => finding.agencyNames))],
    }))
    .filter(group => group.slugs.length > 1);
  const validationIssues = aggregateValidationIssues(findings);
  const validationErrors = findings.filter(finding => finding.validation.errors > 0);
  const warningFeeds = findings.filter(finding => finding.validation.warnings > 0);
  const expiryMismatches = findings.filter(finding => finding.expiryMismatch);
  const geographyMismatches = findings.filter(finding => finding.geographyMismatch);
  const shapeAnomalyFeeds = findings.filter(finding => finding.shapeAnomalies.total > 0);

  const report = {
    expectedActiveAgencies: active.length,
    parsed: findings.length,
    invalidOrMissing: missing.length + parseErrors.length,
    feedsWithValidationErrors: validationErrors.length,
    feedsWithWarnings: warningFeeds.length,
    totalErrors: findings.reduce((sum, finding) => sum + finding.validation.errors, 0),
    totalWarnings: findings.reduce((sum, finding) => sum + finding.validation.warnings, 0),
    totalInfos: findings.reduce((sum, finding) => sum + finding.validation.infos, 0),
    validationIssues,
    missingArchiveZips: missing,
    parseErrors,
    expiryMismatches: expiryMismatches.map(finding => ({ slug: finding.slug, registry: finding.registryExpiry, actual: finding.feedExpiry })),
    geographyMismatches: geographyMismatches.map(finding => ({ slug: finding.slug, agencyNames: finding.agencyNames })),
    duplicateContentGroups: duplicateHashes,
    shapeAnomalies: {
      feeds: shapeAnomalyFeeds.length,
      total: shapeAnomalyFeeds.reduce((sum, finding) => sum + finding.shapeAnomalies.total, 0),
      truncated: shapeAnomalyFeeds.reduce((sum, finding) => sum + finding.shapeAnomalies.truncated, 0),
      deinterleaved: shapeAnomalyFeeds.reduce((sum, finding) => sum + finding.shapeAnomalies.deinterleaved, 0),
      clusteredJumps: shapeAnomalyFeeds.reduce((sum, finding) => sum + finding.shapeAnomalies.clusteredJumps, 0),
      repairedClusteredJumps: shapeAnomalyFeeds.reduce((sum, finding) => sum + finding.shapeAnomalies.repairedClusteredJumps, 0),
      knownIsolatedPointFixed: shapeAnomalyFeeds.reduce((sum, finding) => sum + finding.shapeAnomalies.knownIsolatedPointFixed, 0),
    },
    shapeAudit: 'skipped-for-structural-pass',
    findings: findings.filter(finding =>
      finding.validation.errors > 0 || finding.validation.warnings > 0 || finding.expiryMismatch || finding.geographyMismatch
    ),
  };
  console.log(JSON.stringify(report, null, 2));

  if (missing.length || parseErrors.length || validationErrors.length || geographyMismatches.length) {
    const failures = [
      missing.length ? `${missing.length} archived ZIP(s) missing` : null,
      parseErrors.length ? `${parseErrors.length} archived ZIP(s) failed to parse` : null,
      validationErrors.length ? `${validationErrors.length} feed(s) have validation errors` : null,
      geographyMismatches.length ? `${geographyMismatches.length} feed(s) fall outside their configured geography` : null,
    ].filter((failure): failure is string => failure !== null);
    throw new Error(`Current GTFS audit failed: ${failures.join('; ')}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
