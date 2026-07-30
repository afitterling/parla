#!/bin/bash
# Install the packaged Parla.app into /Applications.
#
# electron-builder produces an unsigned bundle (`"identity": null`), but macOS on
# Apple silicon refuses to launch unsigned code — so we ad-hoc sign it here.
# Ad-hoc signing is enough for a locally installed personal app and keeps the
# bundle id stable, which is what TCC ties the microphone/location grants to.
set -euo pipefail

cd "$(dirname "$0")/.."

APP="dist/mac-arm64/Parla.app"
DEST="/Applications/Parla.app"

[ -d "$APP" ] || { echo "Not built: $APP — run 'npm run package:mac' first." >&2; exit 1; }

echo "Ad-hoc signing $APP …"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

if pgrep -x Parla >/dev/null; then
  echo "Quitting the running Parla …"
  osascript -e 'quit app "Parla"' || true
  sleep 1
fi

echo "Installing to $DEST …"
rm -rf "$DEST"
cp -R "$APP" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

echo "Installed $DEST"
