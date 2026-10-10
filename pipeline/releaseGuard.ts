/**
 * Guards that keep the map (PMTiles) and the agency data (route JSON) paired.
 *
 * A data release is only valid when its tiles and its agency snapshots came
 * out of the same build-pmtiles run, under the tile rules the deployed app
 * expects. Everything here is pure so it can be tested without R2.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROUTE_ARTIFACT_SCHEMA_VERSION, TILE_RULES_VERSION } from '../shared/artifactSchema.js';

export interface ReleaseManifest {
  releaseId: string;
  generatedAt: string;
  routeArtifactSchemaVersion: number;
  tileRulesVersion: number;
  codeVersion?: string;
  pmtilesKey: string;
  overviewPmtilesKey: string;
  agencyPrefix: string;
}

/** Files whose output is baked into tile properties at build time. */
export const TILE_RULES_SOURCE_FILES = [
  // Overview property list and zoom thresholds are baked here.
  'pipeline/build-pmtiles.ts',
  'pipeline/prepareAgencyRoutesForTiles.ts',
  'shared/routeHeadwayFilter.ts',
  'shared/worstDirection.ts',
  'shared/pmtilesProps.ts',
] as const;

export function tileRulesFingerprint(root = process.cwd()): string {
  const hash = createHash('sha256');
  for (const file of TILE_RULES_SOURCE_FILES) {
    hash.update(`${file}\n`);
    hash.update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex');
}

/** Field written into each release route snapshot and into PMTiles metadata (`name`). */
export const RELEASE_STAMP_FIELD = 'atlasReleaseId';

export const ALLOW_UNPAIRED_UPLOAD_FLAG = '--allow-unpaired-pmtiles-upload';

/**
 * Uploading to the legacy root `atlas.pmtiles` bypasses the release pairing:
 * those tiles are not matched to any agency snapshot. Refuse unless the
 * operator explicitly asks for it.
 */
export function unpairedUploadError(argv: string[], command: string): string | null {
  if (argv.includes(ALLOW_UNPAIRED_UPLOAD_FLAG)) return null;
  return `${command} uploads map tiles outside a verified data release, so the map could disagree with the route cards. `
    + 'Use npm run refresh-release (or build-pmtiles, verify-pmtiles-remote, build-history, publish-data-release) instead. '
    + `Pass ${ALLOW_UNPAIRED_UPLOAD_FLAG} only for an intentional, approved repair.`;
}

export function releasePrefixOf(manifest: Pick<ReleaseManifest, 'releaseId'>): string {
  return `atlas/releases/${manifest.releaseId}`;
}

export function manifestShapeError(value: Partial<ReleaseManifest> | null | undefined): string | null {
  if (!value) return 'Release manifest is missing.';
  if (!value.releaseId || !/^release-[a-z0-9]+$/.test(value.releaseId)) return 'Release manifest has no valid releaseId.';
  const prefix = releasePrefixOf(value as ReleaseManifest);
  if (value.pmtilesKey !== `${prefix}/atlas.pmtiles`
    || value.overviewPmtilesKey !== `${prefix}/atlas-overview.pmtiles`
    || value.agencyPrefix !== `${prefix}/agencies`) {
    return `Release manifest keys do not all point at ${prefix}.`;
  }
  if (!value.generatedAt || Number.isNaN(Date.parse(value.generatedAt))) return 'Release manifest has no valid generatedAt.';
  if (value.routeArtifactSchemaVersion !== ROUTE_ARTIFACT_SCHEMA_VERSION) {
    return `Release was built for route schema ${value.routeArtifactSchemaVersion ?? 'missing'}; this code expects ${ROUTE_ARTIFACT_SCHEMA_VERSION}.`;
  }
  if (value.tileRulesVersion !== TILE_RULES_VERSION) {
    return `Release tiles were built under tile rules ${value.tileRulesVersion ?? 'missing'}; this code uses ${TILE_RULES_VERSION}. Rebuild the release with this code.`;
  }
  return null;
}

export interface PublishEvidence {
  /** Manifest left on disk by build-pmtiles in this checkout. */
  local: Partial<ReleaseManifest> | null;
  /** `${releasePrefix}/manifest.json` as read back from R2 (written last by build-pmtiles). */
  remote: Partial<ReleaseManifest> | null;
  /** The currently public `atlas/release.json`, or null if none exists. */
  current: Partial<ReleaseManifest> | null;
  /** `name` metadata of the uploaded full and overview PMTiles archives. */
  pmtilesName: unknown;
  overviewPmtilesName: unknown;
  /** Release stamp read from a sample of the uploaded agency route snapshots. */
  agencyStamps: Record<string, unknown>;
  /** Code version of the checkout running the publish (git SHA), if known. */
  codeVersion?: string;
}

/** Returns why a release must not be published, or null when it is safe. */
export function releasePublishError(evidence: PublishEvidence): string | null {
  const { local } = evidence;
  const shapeError = manifestShapeError(local);
  if (shapeError) return shapeError;
  const manifest = local as ReleaseManifest;

  if (!evidence.remote || JSON.stringify(sortKeys(evidence.remote)) !== JSON.stringify(sortKeys(manifest))) {
    return `Uploaded manifest for ${manifest.releaseId} is missing or differs from the local build; the upload did not finish or the local manifest is left over from another build.`;
  }
  if (manifest.codeVersion && evidence.codeVersion && manifest.codeVersion !== evidence.codeVersion) {
    return `Release ${manifest.releaseId} was built from ${manifest.codeVersion} but publish is running from ${evidence.codeVersion}.`;
  }
  if (evidence.current?.generatedAt && Date.parse(evidence.current.generatedAt) >= Date.parse(manifest.generatedAt)) {
    return `The public release (${evidence.current.releaseId}) is the same age or newer than ${manifest.releaseId}; refusing to roll back.`;
  }
  if (evidence.pmtilesName !== manifest.releaseId || evidence.overviewPmtilesName !== manifest.releaseId) {
    return `Map tiles are not stamped with ${manifest.releaseId} (found ${String(evidence.pmtilesName)} / ${String(evidence.overviewPmtilesName)}); they were not built with this release's agency data.`;
  }
  const sampled = Object.entries(evidence.agencyStamps);
  if (sampled.length === 0) return 'No agency snapshots were checked; refusing to publish blind.';
  const mismatched = sampled.filter(([, stamp]) => stamp !== manifest.releaseId);
  if (mismatched.length > 0) {
    return `Agency snapshots not stamped with ${manifest.releaseId}: ${mismatched.map(([slug, stamp]) => `${slug}=${String(stamp)}`).join(', ')}.`;
  }
  return null;
}

function sortKeys(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

/** Git commit of the code building or publishing a release, when available. */
export function currentCodeVersion(): string | undefined {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}
