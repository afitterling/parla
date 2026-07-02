#!/usr/bin/env bash
#
# Build the Release configuration with the .env.dev keys baked in and install it
# on a connected iPhone. The result runs standalone — no Metro needed afterwards.
#
# Usage:
#   scripts/release-device.sh              # current version, auto-pick device
#   scripts/release-device.sh 1.2.0        # bump version (build auto +1) first
#   scripts/release-device.sh 1.2.0 7      # set version + build first
#   DEVICE_UDID=00008101-0008083221D0001E scripts/release-device.sh   # force a device
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

VERSION="${1:-}"
BUILD="${2:-}"

if [[ ! -f .env.dev ]]; then
  echo "error: .env.dev not found in $APP_DIR" >&2
  exit 1
fi

# Optional version bump before building.
if [[ -n "$VERSION" ]]; then
  "$SCRIPT_DIR/setVersion.sh" "$VERSION" "$BUILD"
fi

# Pick a connected physical iPhone. Hardware UDIDs look like 00008101-000261D42EB8001E
# (8 hex, dash, 16 hex) — simulators have the multi-dash UUID form, which we skip.
if [[ -z "${DEVICE_UDID:-}" ]]; then
  DEVICES="$(xcrun xctrace list devices 2>/dev/null \
    | grep -iE 'iphone' \
    | grep -E '\(00[0-9A-Fa-f]{6}-[0-9A-Fa-f]{16}\)' || true)"
  COUNT="$(printf '%s' "$DEVICES" | grep -c . || true)"

  if [[ "$COUNT" -eq 0 ]]; then
    echo "error: no connected iPhone found — plug one in, unlock it, and trust this Mac." >&2
    exit 1
  fi
  if [[ "$COUNT" -gt 1 ]]; then
    echo "Multiple iPhones connected — using the first. Pick another with DEVICE_UDID=…:" >&2
    printf '  %s\n' "$DEVICES" >&2
  fi

  LINE="$(printf '%s\n' "$DEVICES" | head -1)"
  DEVICE_UDID="$(printf '%s' "$LINE" | sed -E 's/.*\(([^)]*)\)[[:space:]]*$/\1/')"
  DEVICE_NAME="$(printf '%s' "$LINE" | sed -E 's/[[:space:]]*\([^)]*\)[[:space:]]*\([^)]*\)[[:space:]]*$//')"
else
  DEVICE_NAME="(forced)"
fi

echo "→ installing Release build on $DEVICE_NAME ($DEVICE_UDID)"
echo "  keys baked from .env.dev"

npx dotenv -e .env.dev -- npx expo run:ios --device "$DEVICE_UDID" --configuration Release

echo "✓ installed. The app runs standalone — you can close/kill any leftover Metro."
