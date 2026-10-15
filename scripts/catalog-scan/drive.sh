#!/bin/zsh
# Scans every agency in <slugsFile> with the pipeline of <tree>, in chunks of [chunk] agencies per
# process (default 6), waiting while free memory is under 20%. See README.md.
# usage: drive.sh <tree> <outDir> <slugsFile> <zipsRoot> [chunk]
# Run at normal priority: background mode (taskpolicy -b) starves the scan on macOS.
set -u
if [ $# -lt 4 ]; then echo "usage: drive.sh <tree> <outDir> <slugsFile> <zipsRoot> [chunk]" >&2; exit 2; fi
here=${0:A:h}
tree=${1:A}; out=${2:A}; slugs=${3:A}; zips=${4:A}; chunk=${5:-6}
mkdir -p $out
log=$out.log
work=$(mktemp -d)
echo "== start $(date) tree=$tree slugs=$(wc -l < $slugs)" >> $log
split -l $chunk $slugs $work/chunk.
for c in $work/chunk.*; do
  while true; do
    f=$(memory_pressure 2>/dev/null | tail -1 | grep -o '[0-9]*%' | tr -d %)
    [ -z "$f" ] || [ "$f" -ge 20 ] && break
    echo "mem low $f% $(date)" >> $log; sleep 30
  done
  ( cd $tree && NODE_OPTIONS=--max-old-space-size=8192 npx tsx $here/scan.mts $tree $c $out $zips ) >> $log 2>&1
done
rm -rf $work
echo "== end $(date)" >> $log
echo DONE > $out.DONE
