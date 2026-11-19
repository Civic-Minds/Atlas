#!/bin/bash
# Build the Live route analysis (schema v3) for one or more TTC routes from the local archive and timetable.
#   npm run live:analyze -- 505            one route, last 7 service dates
#   npm run live:analyze -- 505 510 --days 14
#   npm run live:analyze -- all            every analysis route (501, 503-507, 509-512)
#   npm run live:analyze -- all --agency kingston --days 15   another archived agency (CIV-1686): every route in its archive
# Reads ../_live-data (archive/ = archived positions, gtfs/candidates/surface = the TTC surface timetable, or every folder under
# gtfs/candidates/surface-feeds/ when it exists: one timetable per feed, each service date uses the feed that covers it) and writes
# ../_live-data/out/ttc-<route>-segments.json, which the local API serves. Set LIVE_DATA to use another folder.
# Another agency (--agency <slug>) reads archive-<slug>/ (scripts/live-fetch-archive.ts --agency) and every timetable folder
# under gtfs/candidates/<slug>-feeds/ (scripts/live-gtfs-for-window.ts --agency), and writes out/<slug>-<route>-segments.json.
set -u
cd "$(dirname "$0")/.."
DATA="${LIVE_DATA:-../_live-data}"
DAYS=7
AGENCY=ttc
ALL=0
ROUTES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    --agency) AGENCY="$2"; shift 2 ;;
    all) ALL=1; shift ;;
    *) ROUTES+=("$1"); shift ;;
  esac
done
[[ "$AGENCY" =~ ^[a-z0-9-]+$ ]] || { echo "live:analyze: bad --agency \"$AGENCY\"" >&2; exit 1; }
if [ "$AGENCY" = "ttc" ]; then
  ARCHIVE="$DATA/archive"
  [ $ALL = 1 ] && ROUTES=(501 503 504 505 506 507 509 510 511 512)
else
  ARCHIVE="$DATA/archive-$AGENCY"
  # No configured route list for other agencies: every route the archive holds positions for (<route>-<YYYY-MM-DD>.jsonl).
  if [ $ALL = 1 ] && [ -d "$ARCHIVE" ]; then
    while IFS= read -r r; do ROUTES+=("$r"); done < <(ls "$ARCHIVE" | sed -nE 's/^(.+)-[0-9]{4}-[0-9]{2}-[0-9]{2}\.jsonl$/\1/p' | sort -u)
  fi
fi
[ ${#ROUTES[@]} -gt 0 ] || { echo "live:analyze: give a route, e.g. npm run live:analyze -- 505 (or: all; for another agency, all needs positions in its archive folder)" >&2; exit 1; }
[ -d "$ARCHIVE" ] || { echo "live:analyze: no archive at $ARCHIVE. Set LIVE_DATA to the folder that holds archive/ and gtfs/." >&2; exit 1; }
if [ "$AGENCY" = "ttc" ]; then
  # One timetable folder, or several (a window that spans a feed change): every folder with a trips.txt under surface-feeds/.
  GTFS="$DATA/gtfs/candidates/surface"
  if [ -d "$DATA/gtfs/candidates/surface-feeds" ]; then
    FEEDS=()
    for d in "$DATA"/gtfs/candidates/surface-feeds/*/; do [ -f "${d}trips.txt" ] && FEEDS+=("${d%/}"); done
    if [ ${#FEEDS[@]} -gt 0 ]; then GTFS=$(IFS=,; echo "${FEEDS[*]}"); fi
  fi
  [ "$GTFS" != "$DATA/gtfs/candidates/surface" ] || [ -f "$DATA/gtfs/candidates/surface/trips.txt" ] || { echo "live:analyze: no timetable at $DATA/gtfs/candidates/surface (the TTC surface GTFS, trip numbers matching the live feed)." >&2; exit 1; }
else
  # The agency's own static timetables, one folder per feed (scripts/live-gtfs-for-window.ts --agency <slug>).
  FEEDS=()
  for d in "$DATA"/gtfs/candidates/"$AGENCY"-feeds/*/; do [ -f "${d}trips.txt" ] && FEEDS+=("${d%/}"); done
  [ ${#FEEDS[@]} -gt 0 ] || { echo "live:analyze: no timetable under $DATA/gtfs/candidates/$AGENCY-feeds/ (run scripts/live-gtfs-for-window.ts --agency $AGENCY)." >&2; exit 1; }
  GTFS=$(IFS=,; echo "${FEEDS[*]}")
fi
mkdir -p "$DATA/out"
for route in "${ROUTES[@]}"; do
  ls "$ARCHIVE/$route-"*.jsonl >/dev/null 2>&1 || { echo "live:analyze: no archived positions for route $route in $ARCHIVE." >&2; exit 1; }
  echo "live:analyze: route $route ..."
  EXTRA=()
  if [ "$AGENCY" = "ttc" ]; then
    # Some routes share a number with another service (506 runs streetcars and, in parallel, 506B replacement buses; 504
    # runs its streetcar diversion and 504C King replacement buses, CIV-1918): analyse the named service only.
    { [ "$route" = "506" ] || [ "$route" = "504" ]; } && EXTRA=(--exclude-headsign "replacement bus")
    # The 507M is a shuttle to Marine Parade, a separate service from the 507 Long Branch line.
    [ "$route" = "507" ] && EXTRA=(--separate-service "507M")
  else
    EXTRA=(--agency "$AGENCY")
  fi
  NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/live-segment-delay.ts \
    --gtfs "$GTFS" --archive "$ARCHIVE" --route "$route" --days "$DAYS" ${EXTRA[@]+"${EXTRA[@]}"} \
    --out "$DATA/out/$AGENCY-$route-segments.json" | grep -E "^(v3|dates)" || exit 1
done
# The agency page (/apps/live/ttc) reads one summary of every route's analysis. Other agencies have no agency page
# (live-segment-delay.ts still rebuilds <slug>-agency.json after each route).
[ "$AGENCY" = "ttc" ] || exit 0
npx tsx scripts/live-agency-summary.ts ttc || exit 1
