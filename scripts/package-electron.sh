#!/usr/bin/env bash
# Package Director as an Electron desktop app.
# Run from the project root:  bash scripts/package-electron.sh [linux|darwin|win32]
set -euo pipefail

PLATFORM="${1:-$(node -e 'console.log(process.platform)')}"
APP_NAME="Director"
OUT_DIR="electron-release"

echo "==> Installing Electron deps (first run only, ~150MB)…"
if ! [ -d node_modules/electron ]; then
  npm install --save-dev electron @electron/packager
fi

echo "==> Building the web app…"
npx vite build

echo "==> Packaging for $PLATFORM…"
rm -rf "$OUT_DIR"
npx @electron/packager . "$APP_NAME" \
  --platform="$PLATFORM" \
  --arch=x64 \
  --out="$OUT_DIR" \
  --overwrite \
  --ignore="^/src" \
  --ignore="^/public" \
  --ignore="^/scripts" \
  --ignore="^/$OUT_DIR" \
  --ignore="^/\\.workspace" \
  --ignore="^/\\.lovable"

echo "==> Done.  Output in ./$OUT_DIR"
ls -1 "$OUT_DIR"
