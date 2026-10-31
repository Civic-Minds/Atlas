/**
 * CIV-522: a rebuild writes its agency files under its own run prefix, `atlas/runs/<run id>/`, not
 * over the top-level `atlas/<slug>.json` files. build-pmtiles builds the release from that prefix
 * (`--source-prefix`), and only after publish-data-release has made the release public does the
 * promote step copy the run's files to top-level. A run that stops anywhere before that (a gate
 * refusal, a tile or verify failure, a cancel or a timeout) leaves only its own prefix, which nothing
 * reads, so the top-level files stay what was last published.
 *
 * Not "staging": that name is already the beta bucket (ATLAS_ENV=staging).
 */

/** The files each agency publishes, as `${slug}${suffix}.json`. */
export const AGENCY_ARTIFACT_SUFFIXES = ['', '-stops', '-corridors', '-trips', '-stops-meta', '-sections'] as const;

export const RUN_ARTIFACT_ROOT = 'atlas/runs';

/** The prefix a run writes under. A run id is the workflow run id, or any short token for a local run. */
export function runArtifactPrefix(runId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) throw new Error(`Bad run id for the run prefix: ${JSON.stringify(runId)}`);
  return `${RUN_ARTIFACT_ROOT}/${runId}`;
}

/**
 * The value of `flag` (`--run-prefix atlas/runs/123`), or null when absent. Only a prefix under
 * RUN_ARTIFACT_ROOT is accepted, so a typo can never point a write or a promote at top-level files.
 */
export function parseRunPrefixArg(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value such as ${RUN_ARTIFACT_ROOT}/<run id>.`);
  const prefix = value.replace(/\/+$/, '');
  if (runArtifactPrefix(prefix.slice(RUN_ARTIFACT_ROOT.length + 1)) !== prefix) {
    throw new Error(`${flag} must be ${RUN_ARTIFACT_ROOT}/<run id>, got ${JSON.stringify(value)}.`);
  }
  return prefix;
}

/** The agencies a run staged: those whose route file is under the prefix (keys from one listing). */
export function stagedAgencySlugs(keys: readonly string[], prefix: string, slugs: readonly string[]): Set<string> {
  const present = new Set(keys);
  return new Set(slugs.filter(slug => present.has(`${prefix}/${slug}.json`)));
}

/** The top-level key a staged key promotes to: `atlas/runs/<id>/ttc-stops.json` -> `atlas/ttc-stops.json`. */
export function promotedKey(stagedKey: string, prefix: string): string | null {
  if (!stagedKey.startsWith(`${prefix}/`)) return null;
  const name = stagedKey.slice(prefix.length + 1);
  return name && !name.includes('/') && name.endsWith('.json') ? `atlas/${name}` : null;
}

export interface PromoteStore {
  list(prefix: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
}

/**
 * Copy every file the run staged to its top-level key. Run only after the release is public: the
 * files are then what users already see. Safe to repeat, and a promote that stops halfway leaves
 * top-level files that are each either the last or the new published copy.
 */
export async function promoteRunArtifacts(
  prefix: string,
  store: PromoteStore,
  runAll: (tasks: Array<() => Promise<void>>) => Promise<void>,
): Promise<{ promoted: number; skipped: string[] }> {
  const keys = await store.list(`${prefix}/`);
  const skipped: string[] = [];
  const tasks: Array<() => Promise<void>> = [];
  for (const key of keys) {
    const target = promotedKey(key, prefix);
    if (!target) { skipped.push(key); continue; }
    tasks.push(async () => {
      const body = await store.get(key);
      if (body == null) throw new Error(`Staged file vanished before promote: ${key}`);
      await store.put(target, body);
    });
  }
  await runAll(tasks);
  return { promoted: tasks.length, skipped };
}
