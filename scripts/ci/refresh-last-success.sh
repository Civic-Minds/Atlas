#!/bin/bash
# When a daily Live refresh last succeeded (CIV-2177, #1743): prints the newest completed_at (UTC, ISO) of the named job
# among the workflow's recent runs on main, or nothing when none in the last 3 days succeeded. A run counts only when the
# job that writes the files succeeded (publish for live-report-refresh.yml, studio-live for studio-live-refresh.yml), so
# a scheduled run the backup check skipped never counts. Where a dry run and a publish run the same job (studio-live),
# the optional third argument names the run title's publish mark ("(publish)"), so a dry run never counts (#1807).
#
#   scripts/ci/refresh-last-success.sh <workflow file> <job name> [run title mark]
#
# In GitHub Actions it uses GH_TOKEN (actions: read) and GITHUB_REPOSITORY; on this Mac, gh's own login and Civic-Minds/Atlas.
# The manager's check-in uses it to flag a refresh whose last success is over 30 hours old (Linux and macOS date both work).
set -euo pipefail
WF="$1"; JOB="$2"; MARK="${3:-}"
REPO="${GITHUB_REPOSITORY:-Civic-Minds/Atlas}"
since="$(date -u -d '3 days ago' +%FT%TZ 2>/dev/null || date -u -v-3d +%FT%TZ)"
# Only runs on main (a branch never publishes), and with a mark, only runs whose title carries it.
runs="$(gh api "repos/$REPO/actions/workflows/$WF/runs?status=completed&branch=main&created=>=$since&per_page=50" \
  --jq ".workflow_runs[] | select(.head_branch == \"main\") | select(\"$MARK\" == \"\" or (.display_title | contains(\"$MARK\"))) | .id")"
latest=""
for id in $runs; do
  t="$(gh api "repos/$REPO/actions/runs/$id/jobs" --jq ".jobs[] | select(.name == \"$JOB\" and .conclusion == \"success\") | .completed_at")"
  if [ -n "$t" ] && [[ -z "$latest" || "$t" > "$latest" ]]; then latest="$t"; fi
done
echo "$latest"
