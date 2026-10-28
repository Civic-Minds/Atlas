/**
 * Rolling the public data release pointer back to an earlier release (CIV-521). Pure planning: the CLI
 * (rollback-data-release.ts) gathers the evidence and, only with --apply, makes the two writes this returns.
 *
 * A rollback writes the target's manifest to atlas/release.json and then bumps atlas/data-version.json so
 * browsers drop their cached agency files. It never deletes anything under atlas/releases/, never touches
 * the per-agency top-level files, and leaves atlas/release-history.json alone (that file lists releases
 * that were published, and the target already is one).
 */
import { manifestShapeError, releasePrefixOf, type ReleaseManifest } from './releaseGuard.js';

export const RELEASE_POINTER_KEY = 'atlas/release.json';

export interface RollbackEvidence {
  /** The manifest to restore: atlas/releases/<id>/manifest.json, or a saved copy of an earlier release.json. */
  target: Partial<ReleaseManifest> | null;
  /** Where the target came from, for the plan's wording. */
  targetSource: string;
  /** The release.json public now. */
  current: Partial<ReleaseManifest> | null;
  /** Whether each file the restored pointer would send browsers to still exists in the public bucket. */
  files: Array<{ key: string; exists: boolean }>;
  /** Release ids in atlas/release-history.json, oldest first (empty when the file can't be read). */
  historyIds: string[];
}

export interface RollbackPlan {
  /** Any of these stops the rollback, with or without --apply. */
  errors: string[];
  /** Printed, but don't stop it. */
  warnings: string[];
  /** The writes --apply would make, in order. The data-version bump is generated at write time. */
  writes: Array<{ key: string; body: string }>;
  summary: string;
}

/** The keys a restored pointer sends browsers to: the manifest, both tile archives, and the agency samples given. */
export function rollbackFileKeys(target: ReleaseManifest, agencySlugs: readonly string[]): string[] {
  const prefix = releasePrefixOf(target);
  return [
    `${prefix}/manifest.json`,
    target.pmtilesKey,
    target.overviewPmtilesKey,
    ...agencySlugs.map(slug => `${target.agencyPrefix.replace(/\/$/, '')}/${slug}.json`),
  ];
}

export function planRollback(evidence: RollbackEvidence): RollbackPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { target, current } = evidence;

  // The same checks a publish makes on its manifest: valid id, keys under its own prefix, and built for
  // this code's route schema and tile rules, so the restored release renders with the deployed app.
  const shapeError = manifestShapeError(target);
  if (shapeError) errors.push(`Target ${evidence.targetSource}: ${shapeError}`);

  if (target?.releaseId && current?.releaseId === target.releaseId) {
    errors.push(`${target.releaseId} is already the public release; nothing to roll back.`);
  }
  if (target?.generatedAt && current?.generatedAt && Date.parse(target.generatedAt) > Date.parse(current.generatedAt)) {
    errors.push(`${target.releaseId} is newer than the public ${current.releaseId}; a forward move goes through publish-data-release and its gates.`);
  }

  const missing = evidence.files.filter(file => !file.exists).map(file => file.key);
  if (missing.length) {
    errors.push(`${missing.length} file(s) of ${target?.releaseId ?? 'the target'} are gone (pruned or never uploaded): ${missing.join(', ')}`);
  }

  if (!current) warnings.push(`${RELEASE_POINTER_KEY} could not be read; the plan can't say what it replaces.`);
  if (target?.releaseId && evidence.historyIds.length && !evidence.historyIds.includes(target.releaseId)) {
    warnings.push(`${target.releaseId} is not in atlas/release-history.json, so it was never published; check it is the release you mean.`);
  }

  const writes = errors.length || !target
    ? []
    : [{ key: RELEASE_POINTER_KEY, body: JSON.stringify(target, null, 2) }];
  const summary = errors.length
    ? `Rollback refused (${errors.length} problem${errors.length === 1 ? '' : 's'}).`
    : `Roll ${RELEASE_POINTER_KEY} back from ${current?.releaseId ?? 'unknown'} to ${target!.releaseId}, then bump atlas/data-version.json.`;
  return { errors, warnings, writes, summary };
}
