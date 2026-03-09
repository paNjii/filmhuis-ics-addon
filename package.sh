#!/usr/bin/env bash
# package.sh — builds filmhuis_calendar.xpi from source
# Expected layout:
#   manifest.json
#   content.js
#   style.css
#   icons/icon-48.png
#   icons/icon-96.png

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${SCRIPT_DIR}/filmhuis_calendar.xpi"

cd "$SCRIPT_DIR"

# Verify all required files are present
REQUIRED=(manifest.json content.js style.css icons/icon-48.png icons/icon-96.png)
for f in "${REQUIRED[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: missing required file: $f" >&2
    exit 1
  fi
done

# Remove stale build artifact
rm -f "$OUT"

zip "$OUT" \
  manifest.json \
  content.js \
  style.css \
  icons/icon-48.png \
  icons/icon-96.png

echo "Built: $OUT"
