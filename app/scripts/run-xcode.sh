#!/usr/bin/env bash
#
# Open the native iOS project in Xcode so you can build/run/archive by hand.
# Opens the .xcworkspace (never the .xcodeproj) so CocoaPods are included.
#
# Usage:
#   scripts/run-xcode.sh            # just open Xcode
#   scripts/run-xcode.sh 1.2.0      # set version (build auto +1) first, then open
#   scripts/run-xcode.sh 1.2.0 7    # set version + build first, then open
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE="$APP_DIR/ios/Parla.xcworkspace"

if [[ -n "${1:-}" ]]; then
  "$SCRIPT_DIR/setVersion.sh" "$1" "${2:-}"
fi

if [[ ! -d "$WORKSPACE" ]]; then
  echo "error: $WORKSPACE not found — run 'npx expo prebuild' first." >&2
  exit 1
fi

echo "→ opening $WORKSPACE"
open "$WORKSPACE"
