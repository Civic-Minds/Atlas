#!/bin/bash
# Atlas Studio's report refresh for one agency (Kingston today), on this Mac. The daily cloud build of Studio's Live
# files is studio-live-refresh.yml (CIV-2077, private bucket; `npm run studio:sync` copies it here); this script also
# writes the time-loss reports.
#   npm run studio:report                     Kingston, last 15 service dates
#   npm run studio:report -- kingston --days 15
# Reads with whatever R2 keys the environment has (read only: nothing is written to R2). Fetches the agency's archived
# positions (scripts/live-fetch-archive.ts --agency, from atlas-live), takes each service date's
# timetable from the agency's own archived static GTFS (scripts/live-gtfs-for-window.ts --agency), analyses every route
# in its archive (scripts/live-analyze.sh all --agency) and writes a time-loss report per route to
# $LIVE_DATA/studio/time-loss/. LIVE_DATA defaults to the one shared folder, Atlas-worktrees/_live-data, whichever checkout
# runs it (the main one or a worktree). Runs at low priority.
set -euo pipefail
cd "$(dirname "$0")/.."
AGENCY="${1:-kingston}"
[ $# -gt 0 ] && shift
DAYS=15
while [ $# -gt 0 ]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    *) echo "studio:report: unknown option $1" >&2; exit 1 ;;
  esac
done
[[ "$AGENCY" =~ ^[a-z0-9-]+$ && "$AGENCY" != "ttc" ]] || { echo "studio:report is for Studio agencies, got: $AGENCY" >&2; exit 1; }
. scripts/lib/atlas-paths.sh
export LIVE_DATA="${LIVE_DATA:-$(atlas_worktrees_dir)/_live-data}"
mkdir -p "$LIVE_DATA/archive-$AGENCY" "$LIVE_DATA/gtfs/candidates" "$LIVE_DATA/review"
run() { nice -n 15 "$@"; }
run npx tsx scripts/live-fetch-archive.ts --agency "$AGENCY" --days "$DAYS" --out "$LIVE_DATA/archive-$AGENCY" --prune \
  --routes all --report "$LIVE_DATA/review/$AGENCY-fetch.json"
run npx tsx scripts/live-gtfs-for-window.ts --agency "$AGENCY" --days "$DAYS" \
  --feeds-dir "$LIVE_DATA/gtfs/candidates/$AGENCY-feeds" --archive "$LIVE_DATA/archive-$AGENCY" \
  --report "$LIVE_DATA/review/$AGENCY-timetable-match.json"
run bash scripts/live-analyze.sh all --agency "$AGENCY" --days "$DAYS"
for f in "$LIVE_DATA"/out/"$AGENCY"-*-segments.json; do
  run npx tsx scripts/live-time-loss-report.ts --segments "$f" --out-dir "$LIVE_DATA/studio/time-loss"
done
echo "studio:report: $AGENCY done. Time-loss reports in $LIVE_DATA/studio/time-loss/"
