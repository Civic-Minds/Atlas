#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand) for atlas and atlas-beta.
#
# Exit 0 = skip this build, exit 1 = build. Skips only when nothing that can change the deployed site
# changed since the last successful deploy of this branch (VERCEL_GIT_PREVIOUS_SHA). Docs, research,
# pipeline, workers, CI and changelog-only pushes then stop using up Vercel's 24h deploy limit.
#
# The list below is an allowlist of paths that DO affect the deployed output. When in doubt it builds:
# no previous SHA, a SHA this clone doesn't have, or any git error all mean "build".
# Files that .vercelignore re-includes with a "!path" line (build scripts, one research file) are
# added automatically, so a new build-time script only needs its .vercelignore line.
#
# Only main deploys: both Vercel projects (atlas, atlas-beta) have productionBranch "main" (checked
# 2026-11-15 via the Vercel API). A push of any other branch (helper/work branches) is skipped outright,
# so it never starts a preview build or uses up the deploy limit. To deploy another branch, add it to
# DEPLOY_BRANCHES. VERCEL_GIT_COMMIT_REF is unset in local use, which goes straight to the path check.
#
# Local use: scripts/vercel-ignore-build.sh <previous-sha> <current-sha>
set -u

DEPLOY_BRANCHES=(main)

ref="${VERCEL_GIT_COMMIT_REF:-}"
if [ -n "$ref" ]; then
  deploys=0
  for branch in "${DEPLOY_BRANCHES[@]}"; do
    [ "$ref" = "$branch" ] && deploys=1
  done
  if [ "$deploys" -eq 0 ]; then
    echo "vercel-ignore-build: branch ${ref} is not a deploy branch (${DEPLOY_BRANCHES[*]}), skipping"
    exit 0
  fi
fi

prev="${1:-${VERCEL_GIT_PREVIOUS_SHA:-}}"
curr="${2:-${VERCEL_GIT_COMMIT_SHA:-HEAD}}"

OUTPUT_PATHS=(
  src
  shared
  public
  api
  config
  index.html
  vite.config.ts
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.node.json
  tsconfig.api.json
  vercel.json
  .vercelignore
  docs/legal
  scripts/vercel-ignore-build.sh
)

if [ -f .vercelignore ]; then
  while IFS= read -r line; do
    case "$line" in
      '!'*/) ;;                       # re-included folders are covered by their own file lines
      '!'*) OUTPUT_PATHS+=("${line#!}") ;;
    esac
  done < .vercelignore
fi

if [ -z "$prev" ]; then
  echo "vercel-ignore-build: no previous deploy SHA, building"
  exit 1
fi

if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  # Vercel clones shallowly; try to reach the previous deploy before giving up.
  GIT_TERMINAL_PROMPT=0 git fetch --quiet --deepen=200 2>/dev/null || true
  if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
    echo "vercel-ignore-build: previous deploy ${prev} not in this clone, building"
    exit 1
  fi
fi

git diff --quiet "$prev" "$curr" -- "${OUTPUT_PATHS[@]}"
status=$?
if [ "$status" -eq 0 ]; then
  echo "vercel-ignore-build: nothing that affects the site changed since ${prev}, skipping"
  exit 0
fi
if [ "$status" -ne 1 ]; then
  echo "vercel-ignore-build: git diff failed (${status}), building"
fi
echo "vercel-ignore-build: site files changed since ${prev}, building"
exit 1
