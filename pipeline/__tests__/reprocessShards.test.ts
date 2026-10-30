import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMergeShardsArg, parseShardArg, readShardResults, shardResultPath, shardTargets, type ShardResult } from '../reprocessShards';

// CIV-1110: the reprocess runs as separate processes, one per core; the merge gates and writes
// the whole batch once, and refuses unless every shard covered exactly its own agencies.

const slugs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

function writeShard(index: number, count: number, override: Partial<ShardResult<{ slug: string; status: string }, string, string>> = {}): void {
  const mine = shardTargets(slugs, { index, count });
  const result: ShardResult<{ slug: string; status: string }, string, string> = {
    shard: { index, count },
    slugs: mine,
    rows: mine.map(slug => ({ slug, status: 'processed' })),
    gateInputs: mine.map(slug => [slug, `gate-${slug}`]),
    processedExpiries: mine.map(slug => [slug, `exp-${slug}`]),
    ...override,
  };
  writeFileSync(shardResultPath(dir, index), JSON.stringify(result));
}

describe('reprocess shards', () => {
  it('parses --shard and --merge-shards, and refuses bad values', () => {
    expect(parseShardArg(['--write'])).toBeNull();
    expect(parseShardArg(['--shard', '2/3'])).toEqual({ index: 2, count: 3 });
    expect(() => parseShardArg(['--shard', '4/3'])).toThrow();
    expect(() => parseShardArg(['--shard', '1/5'])).toThrow();
    expect(() => parseShardArg(['--shard'])).toThrow();
    expect(parseMergeShardsArg(['--merge-shards', '3'])).toBe(3);
    expect(parseMergeShardsArg([])).toBeNull();
    expect(() => parseMergeShardsArg(['--merge-shards', '0'])).toThrow();
  });

  it('splits the targets so every agency is in exactly one shard', () => {
    const parts = [1, 2, 3].map(index => shardTargets(slugs, { index, count: 3 }));
    expect(parts).toEqual([['a', 'd', 'g'], ['b', 'e'], ['c', 'f']]);
    expect(parts.flat().sort()).toEqual(slugs);
    expect(shardTargets(slugs, { index: 1, count: 1 })).toEqual(slugs);
  });

  it('merges every shard back in target order, with their gate inputs and expiries', () => {
    dir = mkdtempSync(join(tmpdir(), 'shards-'));
    for (const index of [1, 2, 3]) writeShard(index, 3);
    const merged = readShardResults<{ slug: string; status: string }, string, string>(dir, 3, slugs);
    expect(merged.rows.map(row => row.slug)).toEqual(slugs);
    expect(new Map(merged.gateInputs).get('e')).toBe('gate-e');
    expect(new Map(merged.processedExpiries).get('g')).toBe('exp-g');
  });

  it('fails closed when a shard is missing, covers other agencies, or repeats one', () => {
    dir = mkdtempSync(join(tmpdir(), 'shards-'));
    writeShard(1, 3);
    writeShard(3, 3);
    expect(() => readShardResults(dir, 3, slugs)).toThrow(/shard 2\/3 left no results/);
    writeShard(2, 3, { slugs: ['b'] });
    expect(() => readShardResults(dir, 3, slugs)).toThrow(/different agency list/);
    writeShard(2, 3, { rows: [{ slug: 'b', status: 'processed' }] });
    expect(() => readShardResults(dir, 3, slugs)).toThrow(/no result for 1 agencies \(e\)/);
    writeShard(2, 3, { rows: ['b', 'e', 'a'].map(slug => ({ slug, status: 'processed' })) });
    expect(() => readShardResults(dir, 3, slugs)).toThrow(/a appears in more than one shard/);
    writeShard(2, 2);
    expect(() => readShardResults(dir, 3, slugs)).toThrow(/is shard 2\/2, expected 2\/3/);
  });
});
