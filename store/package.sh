#!/usr/bin/env bash
# Build the Chrome Web Store upload package: a .zip with manifest.json at its
# root plus only the files the extension actually loads. Run from anywhere.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | grep -o '[0-9][0-9.]*')"
OUT="dist/youtube-music-liked-and-loaded-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

zip -q -X "$OUT" \
  manifest.json \
  src/background.js src/content.js src/main-world.js src/inject.css \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png icons/mark.png

echo "Built $OUT"
unzip -l "$OUT"
