#!/bin/bash
# One command to run Atlas Live locally: the API server and Vite together, with a check first.
#   npm run live            (API on 5001, app on 5100)
#   ATLAS_API_PORT=5003 ATLAS_VITE_PORT=5197 npm run live    (other ports, for a second copy)
# Ctrl-C stops both. Live is local-only: it is off in every deployment.
set -u
cd "$(dirname "$0")/.."
API_PORT="${ATLAS_API_PORT:-5001}"
VITE_PORT="${ATLAS_VITE_PORT:-5100}"
fail() { echo "live: $1" >&2; exit 1; }

[ -d node_modules ] || fail "node_modules is missing. Run: npm install"
[ -f .env.local ] || fail ".env.local is missing. Copy .env.example to .env.local (Live needs no key for TTC vehicles; the R2 keys are only for recent positions and history)."
for port in "$API_PORT" "$VITE_PORT"; do
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $port is already in use (another copy of Live or Vite?). Stop it, or pick other ports: ATLAS_API_PORT=<n> ATLAS_VITE_PORT=<n> npm run live"
  fi
done
grep -q '^R2_ACCOUNT_ID=.\+' .env.local 2>/dev/null || echo "live: note: no R2 keys in .env.local, so 'right now' history and recent positions will say why they are empty (vehicles still work)."

API_PID=""; VITE_PID=""
# npx starts the real server as a child, so stop the whole tree.
kill_tree() { for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done; kill "$1" 2>/dev/null; }
cleanup() { [ -n "$VITE_PID" ] && kill_tree "$VITE_PID"; [ -n "$API_PID" ] && kill_tree "$API_PID"; true; }
trap cleanup EXIT INT TERM

ATLAS_API_PORT="$API_PORT" npx tsx api-dev-server.ts &
API_PID=$!
for _ in $(seq 1 40); do
  curl -s -o /dev/null "http://localhost:$API_PORT/api/live-vehicles?agency=ttc" && break
  kill -0 "$API_PID" 2>/dev/null || fail "the API server stopped while starting; see the message above."
  sleep 0.5
done
curl -s -o /dev/null "http://localhost:$API_PORT/api/live-vehicles?agency=ttc" || fail "the API server did not answer on port $API_PORT."

echo "live: API ready on http://localhost:$API_PORT"
echo "live: open http://localhost:$VITE_PORT/apps/live"
ATLAS_API_PORT="$API_PORT" VITE_ATLAS_MODE=dev VITE_LIVE_ENABLED=true npx vite --port "$VITE_PORT" --strictPort &
VITE_PID=$!
wait "$VITE_PID"
