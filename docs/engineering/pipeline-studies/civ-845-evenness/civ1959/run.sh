#!/usr/bin/env bash
# usage: run.sh <worktree-suffix> <outdir-name> <slug> [extra env as K=V ...]
S=/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad
wt=$1; out=$2; slug=$3; shift 3
cd /Users/ryan/Developer/Code/Platforms/Atlas-worktrees/civ1959-$wt || exit 1
mkdir -p $S/civ1959/$out
env -i "$@" PATH="$PATH" HOME="$HOME" TZ=America/Toronto ATLAS_RUN_AT=2026-11-19T12:00:00Z NODE_OPTIONS=--max-old-space-size=6144 ATLAS_ENV_FILE=$S/dryrun-diff/nokeys.env \
  nice -n 15 npx tsx $S/dryrun-diff/drive.ts $slug $S/civ1959/$out > $S/civ1959/$out/log-$slug.txt 2>&1; echo "exit $?" >> $S/civ1959/$out/log-$slug.txt
