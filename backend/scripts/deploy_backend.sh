#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="${1:-$SCRIPT_DIR/deploy_backend.conf}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config not found: $CONFIG_FILE" >&2
  echo "Copy template: $SCRIPT_DIR/deploy_backend.conf.example" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${SERVER_IP:?SERVER_IP is required}"
: "${SSH_KEY:?SSH_KEY is required}"

SSH_USER="${SSH_USER:-ubuntu}"
REMOTE_DIR="${REMOTE_DIR:-/home/$SSH_USER/apps/nexa-backend}"
BACKEND_DIR="${BACKEND_DIR:-$ROOT_DIR}"   # root of backend/ (contains server/ + admin-ui/)
SERVER_SUBDIR="${SERVER_SUBDIR:-server}"  # Node.js API lives here
SSH_PORT="${SSH_PORT:-22}"

# deploy behavior
STRICT_SYNC="${STRICT_SYNC:-true}"                      # true => rsync --delete
PRESERVE_ENV="${PRESERVE_ENV:-true}"                    # keep remote .env
PRESERVE_NODE_MODULES="${PRESERVE_NODE_MODULES:-true}"  # keep remote node_modules
RUN_NPM_CI_IF_LOCK_CHANGED="${RUN_NPM_CI_IF_LOCK_CHANGED:-false}"
RELOAD_PM2="${RELOAD_PM2:-false}"
PM2_APP_NAME="${PM2_APP_NAME:-nexa-backend}"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Backend dir not found: $BACKEND_DIR" >&2
  exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 1
fi

SSH_CMD="ssh -i '$SSH_KEY' -p '$SSH_PORT'"

echo "[1/5] Ensure remote dir exists: $REMOTE_DIR"
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SERVER_IP" "mkdir -p '$REMOTE_DIR'"

echo "[2/5] Preparing sync state"

RSYNC_ARGS=(
  -az
  --progress
  --omit-dir-times
  --exclude '.git'
  --exclude '.DS_Store'
  --exclude 'node_modules'
  --exclude '.env'
)

if [[ "$STRICT_SYNC" == "true" ]]; then
  RSYNC_ARGS+=(--delete --delete-delay)
fi

# Protect remote files/dirs from deletion during strict sync
if [[ "$PRESERVE_ENV" == "true" ]]; then
  RSYNC_ARGS+=(--filter="P ${SERVER_SUBDIR}/.env")
fi
if [[ "$PRESERVE_NODE_MODULES" == "true" ]]; then
  RSYNC_ARGS+=(--filter="P ${SERVER_SUBDIR}/node_modules/")
fi

echo "[3/5] Rsync backend files"
# trailing slash to sync directory contents
rsync "${RSYNC_ARGS[@]}" -e "$SSH_CMD" "$BACKEND_DIR/" "$SSH_USER@$SERVER_IP:$REMOTE_DIR/"

echo "[4/5] Optional post-deploy tasks"

if [[ "$RUN_NPM_CI_IF_LOCK_CHANGED" == "true" ]]; then
  echo "installing dependencies"
  ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SERVER_IP" \
    "cd '$REMOTE_DIR/$SERVER_SUBDIR' && if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi"
fi

if [[ "$RELOAD_PM2" == "true" ]]; then
  echo "Reload pm2 app: $PM2_APP_NAME"
  ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SERVER_IP" "pm2 reload '$PM2_APP_NAME'"
fi

echo "[5/5] Done"
echo "Deployed to $SSH_USER@$SERVER_IP:$REMOTE_DIR"
