#!/usr/bin/env bash
# Sharded reprocess (CIV-1110): REPROCESS_SHARDS processes (default 3), each reprocessing every
# n-th agency on its own core, then one merge that runs the release diff gate over the whole
# batch and, with --write, the R2 writes. The shards never write to R2. Arguments go to the merge
# (--write, --allow ...); the shards get the same arguments minus --write.
#
#   pipeline/reprocess-sharded.sh                 # dry run
#   pipeline/reprocess-sharded.sh --write --allow grt:mode-lost
#
# Each shard's peak memory (the process's maximum resident set size) and time are printed after
# the shards finish. REPROCESS_SHARD_HEAP_MB sets each shard's Node heap cap (default 4608).
set -uo pipefail

shards="${REPROCESS_SHARDS:-3}"
heap="${REPROCESS_SHARD_HEAP_MB:-4608}"
[[ "$shards" =~ ^[1-4]$ ]] || { echo "REPROCESS_SHARDS must be 1-4, got: $shards"; exit 1; }
[[ "$heap" =~ ^[0-9]+$ ]] || { echo "REPROCESS_SHARD_HEAP_MB must be a number, got: $heap"; exit 1; }

shard_args=()
for arg in "$@"; do [ "$arg" = "--write" ] || shard_args+=("$arg"); done

out=tmp/derived-reprocess
mem=tmp/reprocess-shards
rm -rf "$out" "$mem"
mkdir -p "$out" "$mem"

pids=()
for i in $(seq 1 "$shards"); do
  NODE_OPTIONS="--max-old-space-size=$heap" \
    npx tsx pipeline/reprocess-derived-artifacts.ts --shard "$i/$shards" ${shard_args[@]+"${shard_args[@]}"} > "$mem/shard-$i.log" 2>&1 &
  pids+=($!)
done

status=0
for i in $(seq 1 "$shards"); do
  wait "${pids[$((i - 1))]}" || status=1
  echo "::group::Shard $i/$shards log"
  cat "$mem/shard-$i.log"
  echo "::endgroup::"
done

echo "Shard peak memory and time:"
grep -h "^Shard .* done:" "$mem"/shard-*.log || true
[ "$status" -eq 0 ] || echo "A shard exited with an error; the merge refuses to run without every shard's results."

# The merge fails closed when any shard left no results, so it always runs and decides.
npx tsx pipeline/reprocess-derived-artifacts.ts --merge-shards "$shards" "$@"
