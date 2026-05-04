#!/usr/bin/env bash
set -euo pipefail

# ── Atlas Full-Stack Deploy ──────────────────────────────────────────────────
# Builds the frontend, syncs everything to OCI, and restarts the server.
# After this, Atlas is live at http://40.233.99.118:3001
#
# Usage:  npm run deploy
# ─────────────────────────────────────────────────────────────────────────────

OCI_HOST="ubuntu@40.233.99.118"
OCI_KEY="$HOME/.ssh/oracle_key"
REMOTE_DIR="/home/ubuntu/atlas-server"

echo "╔══════════════════════════════════════════════════╗"
echo "║         Atlas — Full-Stack Deploy                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Build the frontend ────────────────────────────────────────────────
echo "→ Building frontend..."
cd "$(dirname "$0")/.."
npm run build 2>&1 | tail -5
echo "  ✓ Frontend built → dist/"
echo ""

# ── Step 2: Build the server ──────────────────────────────────────────────────
echo "→ Building server..."
cd server
npm run build 2>&1 | tail -3
cd ..
echo "  ✓ Server built → server/dist/"
echo ""

# ── Step 3: Sync frontend dist to OCI ────────────────────────────────────────
echo "→ Syncing frontend to OCI..."
rsync -az --delete \
  -e "ssh -i $OCI_KEY" \
  dist/ \
  "$OCI_HOST:$REMOTE_DIR/../dist/"
echo "  ✓ Frontend synced"
echo ""

# ── Step 4: Sync server dist to OCI ──────────────────────────────────────────
echo "→ Syncing server to OCI..."
rsync -az --delete \
  -e "ssh -i $OCI_KEY" \
  server/dist/ \
  "$OCI_HOST:$REMOTE_DIR/dist/"
echo "  ✓ Server synced"
echo ""

# ── Step 5: Open port 3001 if blocked ────────────────────────────────────────
echo "→ Ensuring port 3001 is open..."
ssh -i "$OCI_KEY" "$OCI_HOST" bash -s <<'EOF'
  # Insert ACCEPT rule for port 3001 before the REJECT-all rule (if not already present)
  if ! sudo iptables -C INPUT -p tcp --dport 3001 -j ACCEPT 2>/dev/null; then
    # Find the line number of the REJECT rule and insert before it
    REJECT_LINE=$(sudo iptables -L INPUT --line-numbers -n | grep REJECT | head -1 | awk '{print $1}')
    if [ -n "$REJECT_LINE" ]; then
      sudo iptables -I INPUT "$REJECT_LINE" -p tcp --dport 3001 -j ACCEPT
    else
      sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
    fi
    echo "  ✓ Firewall rule added for port 3001"
    # Persist across reboots
    sudo sh -c 'iptables-save > /etc/iptables/rules.v4' 2>/dev/null || true
  else
    echo "  ✓ Port 3001 already open"
  fi
EOF
echo ""

# ── Step 6: Restart the server ────────────────────────────────────────────────
echo "→ Restarting atlas-server..."
ssh -i "$OCI_KEY" "$OCI_HOST" "cd $REMOTE_DIR && pm2 restart atlas-server --update-env"
echo "  ✓ Server restarted"
echo ""

echo "╔══════════════════════════════════════════════════╗"
echo "║  ✓ Deploy complete                               ║"
echo "║  Atlas is live at: http://40.233.99.118:3001     ║"
echo "╚══════════════════════════════════════════════════╝"
