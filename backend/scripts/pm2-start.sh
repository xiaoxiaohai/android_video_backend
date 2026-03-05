#!/usr/bin/env bash
set -euo pipefail

APP_NAME="nexamedia-api"
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$BACKEND_DIR/server"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[ERROR] pm2 not found. Install first: npm i -g pm2"
  exit 1
fi

cd "$SERVER_DIR"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "[INFO] Restarting existing PM2 app: $APP_NAME"
  pm2 restart "$APP_NAME"
else
  echo "[INFO] Starting PM2 app: $APP_NAME"
  pm2 start npm --name "$APP_NAME" -- start
fi

pm2 save

echo "[OK] $APP_NAME is running under PM2. You can close this terminal now."
echo "[INFO] Check status: pm2 status"
echo "[INFO] View logs:   pm2 logs $APP_NAME"
