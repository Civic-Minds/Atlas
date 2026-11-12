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
# Vercel sets VERCEL=1 for its builds; scripts/vercel-root-shell.mjs only moves the app shell when it is set.
export VERCEL=1
npm ci --no-audit --no-fund
echo "check:vercel: public build"
npm run build
echo "check:vercel: beta build"
VITE_ATLAS_MODE=beta VITE_BETA_BUILD=true VITE_LIVE_ENABLED=true VITE_HISTORY_ENABLED=true \
  VITE_CARD_CLICK_TO_FLAG_ENABLED=true VITE_DIAGNOSTICS_ENABLED=true VITE_UNEVEN_BANNER_ENABLED=true \
  npm run build
for f in dist/app.html dist/area dist/agency; do [ -e "$f" ] || { echo "check:vercel: $f missing" >&2; exit 1; }; done
[ ! -e dist/index.html ] || { echo "check:vercel: dist/index.html still sits at / (the share-preview rewrite would never fire)" >&2; exit 1; }
echo "check:vercel: both builds passed"
