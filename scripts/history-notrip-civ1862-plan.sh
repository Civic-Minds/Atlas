#!/usr/bin/env bash
# CIV-1862: plan the add-only no-trips flag from re-downloaded feeds for one agency, into <out>/full-rebuild.
# Fetch each published period's feed (archive, then the agency's own archive, then the Mobility Database), rebuild it
# pinned at the published date, and plan the flag only on routes the rebuild reproduces exactly. Supplemental feeds
# are left out (--bus-only), so their routes never match and never get the flag. Read-only: the upload is a separate
# step. Used by both the dry-run and the write job of history-notrip-sidecars.yml, so they plan the same way.
#
# Usage: scripts/history-notrip-civ1862-plan.sh <slug> <out> [max-disagree-pct]
# With max-disagree-pct, exits 3 when more than that share of the periods read disagree (the CIV-1850 write limit).
set -euo pipefail
slug="$1"; out="$2"; max_pct="${3:-}"
mkdir -p "$out"
export ATLAS_HISTORY_WEEKEND_PERIODS="$slug"
npx tsx pipeline/history-v2-fetch-pinned.ts --slug "$slug" --out "$out/fetch" 2>&1 | tee "$out/$slug-fetch.log"
bus=()
SLUG="$slug" node -e "const a=require('./public/data/index.json').agencies.find(a=>a.slug===process.env.SLUG);process.exit(a&&a.supplementalFeedUrls&&a.supplementalFeedUrls.length?0:1)" && bus=(--bus-only)
npx tsx pipeline/backfill-history-v2.ts --slug "$slug" --zip-dir "$out/fetch/zips" --out-dir "$out/rebuilt" --pin-from "$out/fetch/published" --notrip-out "$out" ${bus[@]+"${bus[@]}"} > "$out/$slug.log" 2>&1 || { tail -50 "$out/$slug.log"; exit 1; }
grep -E "no-trips|No-trips plan|NOT PINNABLE|FAILED" "$out/$slug.log" || true
SLUG="$slug" OUT_DIR="$out" node -e "const r=require(require('path').resolve(process.env.OUT_DIR,process.env.SLUG+'-notrip-report.json'));const t=r.totals;console.log(['### '+r.slug+' (CIV-1862)','- Periods published: '+t.periodsPublished+'; read: '+t.periodsRead+'; to add the flag: '+t.periodsToAdd,'- Route records: '+t.routeRecords+'; matching exactly: '+t.routesMatched,'- Routes flagged: '+t.routesFlagged+'; flagged but skipped as mismatched: '+t.flaggedButMismatched+'; disagree: '+t.disagree,''].join('\n'))" > "$out/$slug-summary.md" || true
if [ -n "$max_pct" ]; then
  SLUG="$slug" OUT_DIR="$out" MAX_PCT="$max_pct" node -e "
    const t=require(require('path').resolve(process.env.OUT_DIR,process.env.SLUG+'-notrip-report.json')).totals;
    const pct=t.periodsRead?Math.round(1000*t.disagree/t.periodsRead)/10:0;
    if(pct>Number(process.env.MAX_PCT)){console.log('STOP: '+process.env.SLUG+' disagrees on '+pct+'% of the periods read (limit '+process.env.MAX_PCT+'%); nothing will be written');process.exit(3);}
  "
fi
