/**
 * Sharded reprocess (CIV-1110). Processing an agency is synchronous CPU work, so one Node process
 * uses one core whatever REPROCESS_CONCURRENCY says. `--shard i/n` processes every n-th target in
 * its own process and saves its results; `--merge-shards n` reads all n results and runs the
 * release diff gate once over the whole batch, then the R2 writes, exactly as an unsharded run.
 * A shard never gates or writes; a missing, partial or mismatched shard fails the merge closed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ShardSpec {
  /** 1-based. */
  index: number;
  count: number;
}

export interface ShardResult<Row, Gate, Expiry> {
  shard: ShardSpec;
  slugs: string[];
  rows: Row[];
  gateInputs: Array<[string, Gate]>;
  processedExpiries: Array<[string, Expiry]>;
}

export const MAX_SHARDS = 4;

/** `--shard 2/3` -> { index: 2, count: 3 }; null when absent. Throws on a malformed value. */
export function parseShardArg(argv: readonly string[]): ShardSpec | null {
  const i = argv.indexOf('--shard');
  if (i < 0) return null;
  const match = /^(\d+)\/(\d+)$/.exec(argv[i + 1] ?? '');
  const index = match ? Number(match[1]) : NaN;
  const count = match ? Number(match[2]) : NaN;
  if (!(count >= 1 && count <= MAX_SHARDS && index >= 1 && index <= count)) {
    throw new Error(`--shard needs <i>/<n> with 1 <= i <= n <= ${MAX_SHARDS}, got: ${argv[i + 1] ?? '(nothing)'}`);
  }
  return { index, count };
}

/** `--merge-shards 3` -> 3; null when absent. Throws on a malformed value. */
export function parseMergeShardsArg(argv: readonly string[]): number | null {
  const i = argv.indexOf('--merge-shards');
  if (i < 0) return null;
  const count = Number(argv[i + 1]);
  if (!(Number.isInteger(count) && count >= 1 && count <= MAX_SHARDS)) {
    throw new Error(`--merge-shards needs a shard count from 1 to ${MAX_SHARDS}, got: ${argv[i + 1] ?? '(nothing)'}`);
  }
  return count;
}

/** The targets one shard processes: every count-th one, starting at its index. */
export function shardTargets<T>(targets: readonly T[], shard: ShardSpec): T[] {
  return targets.filter((_, i) => i % shard.count === shard.index - 1);
}

export function shardResultPath(outputDir: string, index: number): string {
  return resolve(outputDir, `shard-${index}.json`);
}

/**
 * Read every shard's results. Fails closed when a shard is missing, when the shards do not cover
 * exactly the merge's own targets, or when a target appears twice: nothing is gated or written.
 */
export function readShardResults<Row extends { slug: string }, Gate, Expiry>(
  outputDir: string,
  count: number,
  targetSlugs: readonly string[],
): { rows: Row[]; gateInputs: Array<[string, Gate]>; processedExpiries: Array<[string, Expiry]> } {
  const bySlug = new Map<string, Row>();
  const gateInputs: Array<[string, Gate]> = [];
  const processedExpiries: Array<[string, Expiry]> = [];
  for (let index = 1; index <= count; index++) {
    const path = shardResultPath(outputDir, index);
    if (!existsSync(path)) throw new Error(`shard ${index}/${count} left no results (${path}): it crashed or never ran. Nothing was gated or written.`);
    const result = JSON.parse(readFileSync(path, 'utf8')) as ShardResult<Row, Gate, Expiry>;
    if (result.shard.index !== index || result.shard.count !== count) {
      throw new Error(`${path} is shard ${result.shard.index}/${result.shard.count}, expected ${index}/${count}.`);
    }
    const expected = shardTargets(targetSlugs, { index, count });
    if (expected.join('\n') !== result.slugs.join('\n')) {
      throw new Error(`shard ${index}/${count} processed a different agency list than this merge expects (the index changed between the runs?).`);
    }
    for (const row of result.rows) {
      if (bySlug.has(row.slug)) throw new Error(`${row.slug} appears in more than one shard.`);
      bySlug.set(row.slug, row);
    }
    gateInputs.push(...result.gateInputs);
    processedExpiries.push(...result.processedExpiries);
  }
  const missing = targetSlugs.filter(slug => !bySlug.has(slug));
  if (missing.length) throw new Error(`the shards have no result for ${missing.length} agencies (${missing.slice(0, 5).join(', ')}).`);
  // The report lists the agencies in target order, as an unsharded run does.
  return { rows: targetSlugs.map(slug => bySlug.get(slug)!), gateInputs, processedExpiries };
}
