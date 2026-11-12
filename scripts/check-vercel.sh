#!/usr/bin/env bash
# Build the committed HEAD the way Vercel does: copy the tracked files minus
# everything .vercelignore drops into a temp folder, then `npm ci` and
# `npm run build` there, once as Public and once with the beta flags CI uses.
# A build that passes here but imports an ignored file (#1301: a test importing
# scripts/build-area-page-list.ts) fails the Vercel deploy, so run this before
# pushing to main. Uncommitted changes are not included.
#
# Usage: npm run check:vercel
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/atlas-check-vercel.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

git archive HEAD | tar -x -C "$TMP"
git ls-files --cached --ignored --exclude-from=.vercelignore | (cd "$TMP" && xargs rm -f --)
echo "check:vercel: $(git rev-parse --short HEAD) copied to $TMP without .vercelignore files"

cd "$TMP"
npm ci --no-audit --no-fund
echo "check:vercel: public build"
npm run build
echo "check:vercel: beta build"
# The switches the deployed beta site has (docs/FEATURE_FLAGS.md): reports on, Live map off.
VITE_ATLAS_MODE=beta VITE_BETA_BUILD=true VITE_LIVE_REPORTS_ENABLED=true VITE_HISTORY_ENABLED=true \
  VITE_CARD_CLICK_TO_FLAG_ENABLED=true VITE_UNEVEN_BANNER_ENABLED=true \
  npm run build
echo "check:vercel: both builds passed"
