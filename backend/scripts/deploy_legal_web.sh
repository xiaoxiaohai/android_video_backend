#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONFIG_FILE="${1:-$SCRIPT_DIR/deploy_legal_web.conf}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config not found: $CONFIG_FILE" >&2
  echo "Copy template: $SCRIPT_DIR/deploy_legal_web.conf.example" >&2
  echo "Tip: you can also pass backend deploy config: $SCRIPT_DIR/deploy_backend.conf" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${SERVER_IP:?SERVER_IP is required}"
: "${SSH_KEY:?SSH_KEY is required}"

SSH_USER="${SSH_USER:-ubuntu}"
SSH_PORT="${SSH_PORT:-22}"

LEGAL_WEB_DIR="${LEGAL_WEB_DIR:-$REPO_DIR/docs/legal-web}"
REMOTE_WEB_DIR="${REMOTE_WEB_DIR:-/home/$SSH_USER/apps/nexa-legal-web}"

STRICT_SYNC="${STRICT_SYNC:-true}"    # true => rsync --delete inside REMOTE_WEB_DIR
DRY_RUN="${DRY_RUN:-false}"          # true => rsync --dry-run
FIX_PERMS="${FIX_PERMS:-true}"       # ensure nginx can read files under /home/$SSH_USER/...
FIX_HOME_TRAVERSE="${FIX_HOME_TRAVERSE:-true}" # if deploying under /home/$SSH_USER, ensure others can traverse

if [[ ! -d "$LEGAL_WEB_DIR" ]]; then
  echo "Legal web dir not found: $LEGAL_WEB_DIR" >&2
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

echo "[1/4] Ensure remote dir exists: $REMOTE_WEB_DIR"
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SERVER_IP" "mkdir -p '$REMOTE_WEB_DIR'"

RSYNC_ARGS=(
  -az
  --progress
  --omit-dir-times
  --exclude '.git'
  --exclude '.DS_Store'
  --exclude 'README.md'
  --exclude 'nginx/'
)

if [[ "$STRICT_SYNC" == "true" ]]; then
  RSYNC_ARGS+=(--delete --delete-delay)
fi
if [[ "$DRY_RUN" == "true" ]]; then
  RSYNC_ARGS+=(--dry-run)
fi

echo "[2/4] Rsync legal-web files"
rsync "${RSYNC_ARGS[@]}" -e "$SSH_CMD" "$LEGAL_WEB_DIR/" "$SSH_USER@$SERVER_IP:$REMOTE_WEB_DIR/"

echo "[3/4] Optional: fix permissions for nginx"
if [[ "$FIX_PERMS" == "true" && "$DRY_RUN" != "true" ]]; then
  ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SERVER_IP" "chmod -R a=rX '$REMOTE_WEB_DIR'"
fi

if [[ "$FIX_HOME_TRAVERSE" == "true" && "$DRY_RUN" != "true" ]]; then
  # If /home/$SSH_USER is 750 (common), nginx (www-data) can't traverse.
  if [[ "$REMOTE_WEB_DIR" == "/home/$SSH_USER/"* ]]; then
    ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SERVER_IP" "sudo -n chmod o+x '/home/$SSH_USER' || true"
  fi
fi

echo "[4/4] Done"
echo "Deployed to $SSH_USER@$SERVER_IP:$REMOTE_WEB_DIR"
