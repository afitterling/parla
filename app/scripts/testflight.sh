#!/usr/bin/env bash
#
# Archive the Release build, export it App-Store-signed and upload it to
# TestFlight. Provisioning and upload authenticate with the App Store Connect
# API key in ~/.appstoreconnect (no Xcode UI, no app-specific password).
#
# Usage:
#   scripts/testflight.sh dev                  # tech.sp33c.parla.dev, current version
#   scripts/testflight.sh prod 0.9.1 24        # set version + build first
#   scripts/testflight.sh dev --no-upload      # archive + export only
#   scripts/testflight.sh dev --skip-archive   # re-export/upload the last archive
#
# Notes:
#   • The JS bundle is built with the .env.dev keys baked in — same as
#     release-device.sh. That is the only key source the project has.
#   • Export signs manually against the App Store profile installed in
#     ~/Library/MobileDevice/Provisioning Profiles, picked automatically by
#     bundle id (override with PROFILE_NAME=…). Automatic export is deliberately
#     not used: handed an API key it takes Apple's cloud-signing path, which this
#     account has no access to ("Cloud signing permission error").
#   • The target's App Store Connect record must already exist, otherwise the
#     upload is rejected with "no suitable application record was found".
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

VARIANT=dev
VERSION=""
BUILD=""
UPLOAD=1
ARCHIVE_STEP=1
POSITIONAL=()
for a in "$@"; do
  case "$a" in
    --no-upload)    UPLOAD=0 ;;
    --skip-archive) ARCHIVE_STEP=0 ;;
    --*)            echo "error: unknown flag $a" >&2; exit 1 ;;
    *)              POSITIONAL+=("$a") ;;
  esac
done
[[ ${#POSITIONAL[@]} -ge 1 ]] && VARIANT="${POSITIONAL[0]}"
[[ ${#POSITIONAL[@]} -ge 2 ]] && VERSION="${POSITIONAL[1]}"
[[ ${#POSITIONAL[@]} -ge 3 ]] && BUILD="${POSITIONAL[2]}"

ASC_DIR="$HOME/.appstoreconnect"
ASC_KEY_ID="${ASC_KEY_ID:-A6A9UP5AGH}"
ASC_KEY="$ASC_DIR/private_keys/AuthKey_$ASC_KEY_ID.p8"
ASC_ISSUER="$(cat "$ASC_DIR/issue_id.txt")"
TEAM_ID=Q2ZG8FQS59

[[ -f .env.dev ]] || { echo "error: .env.dev not found in $APP_DIR" >&2; exit 1; }
[[ -f "$ASC_KEY" ]] || { echo "error: App Store Connect key not found: $ASC_KEY" >&2; exit 1; }

"$SCRIPT_DIR/setBundleId.sh" "$VARIANT"
[[ -n "$VERSION" ]] && "$SCRIPT_DIR/setVersion.sh" "$VERSION" "$BUILD"

BUNDLE_ID="$(python3 -c 'import json;print(json.load(open("app.json"))["expo"]["ios"]["bundleIdentifier"])')"
ARCHIVE="$APP_DIR/build/Parla.xcarchive"
EXPORT_DIR="$APP_DIR/build/export"
rm -rf "$EXPORT_DIR"
[[ "$ARCHIVE_STEP" -eq 1 ]] && rm -rf "$ARCHIVE"
mkdir -p "$APP_DIR/build"

# Newest installed profile whose application-identifier matches this bundle id
# and that is not a development one (get-task-allow = false).
if [[ -z "${PROFILE_NAME:-}" ]]; then
  PROFILE_NAME="$(python3 - "$BUNDLE_ID" <<'PY'
import glob, os, plistlib, subprocess, sys
bundle_id = sys.argv[1]
best = None
for path in glob.glob(os.path.expanduser('~/Library/MobileDevice/Provisioning Profiles/*.mobileprovision')):
    try:
        raw = subprocess.run(['security', 'cms', '-D', '-i', path],
                             capture_output=True, check=True).stdout
        p = plistlib.loads(raw)
    except Exception:
        continue
    ent = p.get('Entitlements', {})
    if ent.get('get-task-allow'):
        continue
    if ent.get('application-identifier', '').split('.', 1)[-1] != bundle_id:
        continue
    if best is None or p['CreationDate'] > best['CreationDate']:
        best = p
print(best['Name'] if best else '')
PY
)"
fi
if [[ -z "$PROFILE_NAME" ]]; then
  echo "error: no App Store provisioning profile installed for $BUNDLE_ID" >&2
  echo "       create one for this App ID, download it, then re-run." >&2
  exit 1
fi
echo "→ signing with profile: $PROFILE_NAME"

cat > "$APP_DIR/build/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>$BUNDLE_ID</key><string>$PROFILE_NAME</string>
  </dict>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST

if [[ "$ARCHIVE_STEP" -eq 1 ]]; then
  echo "→ archiving $BUNDLE_ID (Release, keys from .env.dev)"
  npx dotenv -e .env.dev -- xcodebuild \
    -workspace ios/Parla.xcworkspace \
    -scheme Parla \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$ARCHIVE" \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$ASC_KEY" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER" \
    archive
else
  echo "· reusing $ARCHIVE (--skip-archive)"
  [[ -d "$ARCHIVE" ]] || { echo "error: no archive at $ARCHIVE" >&2; exit 1; }
fi

# No -authenticationKey* here on purpose — see the note at the top.
echo "→ exporting for the App Store"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$APP_DIR/build/ExportOptions.plist"

IPA="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
[[ -n "$IPA" ]] || { echo "error: no .ipa produced in $EXPORT_DIR" >&2; exit 1; }
echo "✓ exported $IPA"

if [[ "$UPLOAD" -eq 0 ]]; then
  echo "· skipping upload (--no-upload)"
  exit 0
fi

echo "→ uploading to TestFlight"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER"

echo "✓ uploaded — processing takes a few minutes before it shows in TestFlight"
