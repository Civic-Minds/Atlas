/**
 * Retention for rebuild staging folders, atlas/runs/<run id>/ (CIV-2995). A cloud rebuild stages its agency files
 * there (CIV-522) and promotes them to the top-level files when it publishes, so a run folder is only needed while
 * its run is unpublished, or for a release still kept for rollback. Nothing pruned them: 32 runs, 49.7 GB on
 * 2026-11-26. Pure selection logic; pipeline/prune-runs.ts does the R2 calls.
 */

export const RUN_PREFIX = 'atlas/runs/';
/** A release without a recorded sourcePrefix is taken to come from the newest run written up to this long before it. */
export const RUN_SOURCE_WINDOW_MS = 12 * 60 * 60 * 1000;

const RUN_ID = /^\d+$/;
const RUN_KEY = /^atlas\/runs\/(\d+)\/[^/].*$/;

export function runIdOfKey(key: string): string | null {
  return RUN_KEY.exec(key)?.[1] ?? null;
}

export function runIdOfPrefix(prefix: string | undefined): string | null {
  return /^atlas\/runs\/(\d+)\/?$/.exec(prefix ?? '')?.[1] ?? null;
}

export interface RunInfo {
  id: string;
  /** Last write to any of the run's files, in ms. */
  newest: number;
}

export interface KeptRelease {
  releaseId: string;
  /** Build time, in ms. */
  generatedAt: number;
  /** atlas/runs/<run id>, recorded by build-pmtiles since CIV-2995. */
  sourcePrefix?: string;
  live?: boolean;
}

export interface RunsPrunePlan {
  keep: Array<{ id: string; why: string }>;
  delete: string[];
}

/**
 * Keeps every run a kept release came from (its recorded sourcePrefix, or else the newest run written within
 * RUN_SOURCE_WINDOW_MS before it), every run written after the live release (unpublished or in progress), and the
 * newest run. Everything else is deletable. Throws, so nothing is deleted, when no live release is given.
 */
export function planRunsPrune(args: { runs: RunInfo[]; kept: KeptRelease[] }): RunsPrunePlan {
  const live = args.kept.find(r => r.live);
  if (!live) throw new Error('No live release among the kept releases; not pruning runs.');
  const runs = args.runs.filter(r => RUN_ID.test(r.id)).sort((a, b) => a.newest - b.newest);
  const why = new Map<string, string[]>();
  const keep = (id: string, reason: string) => why.set(id, [...(why.get(id) ?? []), reason]);

  for (const release of args.kept) {
    const named = runIdOfPrefix(release.sourcePrefix);
    if (named) { keep(named, `${release.releaseId} was built from it`); continue; }
    const source = runs.filter(r => r.newest <= release.generatedAt && release.generatedAt - r.newest <= RUN_SOURCE_WINDOW_MS).at(-1);
    if (source) keep(source.id, `${release.releaseId} was likely built from it`);
  }
  for (const run of runs) if (run.newest > live.generatedAt) keep(run.id, `written after the live release ${live.releaseId}`);
  const newest = runs.at(-1);
  if (newest) keep(newest.id, 'newest run');

  return {
    keep: runs.filter(r => why.has(r.id)).map(r => ({ id: r.id, why: why.get(r.id)!.join('; ') })),
    delete: runs.filter(r => !why.has(r.id)).map(r => r.id),
  };
}

/** Every key to delete must sit inside a run folder the plan deletes. */
export function assertDeletableRunKeys(keys: string[], plan: RunsPrunePlan): void {
  const deletable = new Set(plan.delete);
  for (const key of keys) {
    const id = runIdOfKey(key);
    if (!id || !deletable.has(id)) throw new Error(`Refusing to delete ${key}: not inside a run folder the plan deletes.`);
  }
}
