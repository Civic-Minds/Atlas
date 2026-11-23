#!/bin/bash
# When a daily Live refresh last succeeded (CIV-2177, #1743): prints the newest completed_at (UTC, ISO) of the named job
# among the workflow's recent runs, or nothing when none in the last 3 days succeeded. A run counts only when the job
# that writes the files succeeded (publish for live-report-refresh.yml, studio-live for studio-live-refresh.yml), so a
# dry run, or a scheduled run the backup check skipped, never counts.
#
#   scripts/ci/refresh-last-success.sh <workflow file> <job name>
#
# In GitHub Actions it uses GH_TOKEN (actions: read) and GITHUB_REPOSITORY; on this Mac, gh's own login and Civic-Minds/Atlas.
# The manager's check-in uses it to flag a refresh whose last success is over 30 hours old (Linux and macOS date both work).
set -euo pipefail
WF="$1"; JOB="$2"
REPO="${GITHUB_REPOSITORY:-Civic-Minds/Atlas}"
since="$(date -u -d '3 days ago' +%FT%TZ 2>/dev/null || date -u -v-3d +%FT%TZ)"
runs="$(gh api "repos/$REPO/actions/workflows/$WF/runs?status=completed&created=>=$since&per_page=50" --jq '.workflow_runs[].id')"
latest=""
for id in $runs; do
  t="$(gh api "repos/$REPO/actions/runs/$id/jobs" --jq ".jobs[] | select(.name == \"$JOB\" and .conclusion == \"success\") | .completed_at")"
  if [ -n "$t" ] && [[ -z "$latest" || "$t" > "$latest" ]]; then latest="$t"; fi
done
echo "$latest"
