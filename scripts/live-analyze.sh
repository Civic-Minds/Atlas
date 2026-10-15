#!/bin/bash
# Build the Live route analysis (schema v3) for one or more TTC routes from the local archive and timetable.
#   npm run live:analyze -- 505            one route, last 7 service dates
#   npm run live:analyze -- 505 510 --days 14
#   npm run live:analyze -- all            every analysis route (501, 503-507, 509-512)
# Reads ../_live-data (archive/ = archived positions, gtfs/candidates/surface = the TTC surface timetable) and writes
# ../_live-data/out/ttc-<route>-segments.json, which the local API serves. Set LIVE_DATA to use another folder.
set -u
cd "$(dirname "$0")/.."
DATA="${LIVE_DATA:-../_live-data}"
DAYS=7
ROUTES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    all) ROUTES=(501 503 504 505 506 507 509 510 511 512); shift ;;
    *) ROUTES+=("$1"); shift ;;
  esac
done
[ ${#ROUTES[@]} -gt 0 ] || { echo "live:analyze: give a route, e.g. npm run live:analyze -- 505 (or: all)" >&2; exit 1; }
[ -d "$DATA/archive" ] || { echo "live:analyze: no archive at $DATA/archive. Set LIVE_DATA to the folder that holds archive/ and gtfs/." >&2; exit 1; }
[ -f "$DATA/gtfs/candidates/surface/trips.txt" ] || { echo "live:analyze: no timetable at $DATA/gtfs/candidates/surface (the TTC surface GTFS, trip numbers matching the live feed)." >&2; exit 1; }
mkdir -p "$DATA/out"
for route in "${ROUTES[@]}"; do
  ls "$DATA/archive/$route-"*.jsonl >/dev/null 2>&1 || { echo "live:analyze: no archived positions for route $route in $DATA/archive." >&2; exit 1; }
  echo "live:analyze: route $route ..."
  # Some routes share a number with another service (506 runs streetcars and, in parallel, 506B replacement buses): analyse the named service only.
  EXTRA=()
  [ "$route" = "506" ] && EXTRA=(--exclude-headsign "replacement bus")
  NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/live-segment-delay.ts \
    --gtfs "$DATA/gtfs/candidates/surface" --archive "$DATA/archive" --route "$route" --days "$DAYS" ${EXTRA[@]+"${EXTRA[@]}"} \
    --out "$DATA/out/ttc-$route-segments.json" | grep -E "^(v3|dates)" || exit 1
done
