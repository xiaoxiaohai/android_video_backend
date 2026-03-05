#!/usr/bin/env bash
# Deploy admin-ui: build locally then rsync dist/ to server
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ADMIN_UI_DIR="$BACKEND_DIR/admin-ui"
CONFIG_FILE="${1:-$SCRIPT_DIR/deploy_backend.conf}"

# ── Load config (reuse backend conf) ──────────────────────────────
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config not found: $CONFIG_FILE" >&2
  echo "Copy template: $SCRIPT_DIR/deploy_backend.conf.example" >&2
  exit 1
fi
source "$CONFIG_FILE"

: "${SERVER_IP:?SERVER_IP is required}"
: "${SSH_KEY:?SSH_KEY is required}"

SSH_USER="${SSH_USER:-ubuntu}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/apps/nexa-backend}"
SSH_PORT="${SSH_PORT:-22}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

# ── Build ──────────────────────────────────────────────────────────
echo "[1/3] Building admin-ui..."
cd "$ADMIN_UI_DIR"
npm run build

# ── Sync dist/ ────────────────────────────────────────────────────
echo "[2/3] Syncing dist/ to server..."
SSH_CMD="ssh -i '$SSH_KEY' -p '$SSH_PORT'"

ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SERVER_IP" \
  "mkdir -p '$REMOTE_DIR/admin-ui/dist'"

rsync -az --progress --delete \
  --exclude '.DS_Store' \
  -e "$SSH_CMD" \
  "$ADMIN_UI_DIR/dist/" \
  "$SSH_USER@$SERVER_IP:$REMOTE_DIR/admin-ui/dist/"

echo "[3/3] Done"
echo "Admin UI deployed to https://api.nexamedia.app/admin"
