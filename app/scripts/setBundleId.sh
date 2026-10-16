#!/usr/bin/env bash
#
# Switch the app between its identities so every source of truth moves together
# (same idea as setVersion.sh):
#   - app.json                              expo.ios.bundleIdentifier
#                                           + iCloud container in entitlements
#                                             and NSUbiquitousContainers
#   - ios/Parla.xcodeproj/project.pbxproj    PRODUCT_BUNDLE_IDENTIFIER (Debug + Release)
#   - ios/Parla/Parla.entitlements           iCloud container ids
#   - ios/Parla/Info.plist                   NSUbiquitousContainers key
#
# The Settings screen reads the id back out of app.json at runtime, so after a
# switch the installed build says which identity it is.
#
#   dev    → tech.sp33c.parla.dev      (separate TestFlight app, installs next to prod)
#   prod   → tech.sp33c.parla          (the App Store identity)
#   legacy → com.afitterling.sprachapp (the id the phone install has used so far —
#            keep using it to upgrade that app in place instead of installing a
#            second copy with an empty local mirror)
#
# The iCloud container follows as iCloud.<bundle id> — the native module derives
# it from Bundle.main the same way — so each identity owns a separate library and
# a dev build cannot scribble over the one the shipping app uses. Switching is
# therefore not a migration: the new container starts empty, and Settings →
# Backup moves a library across.
#
# Usage:
#   scripts/setBundleId.sh dev
#   scripts/setBundleId.sh prod
#   scripts/setBundleId.sh legacy
#   scripts/setBundleId.sh tech.sp33c.something.else   # explicit id
#
set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in
  dev)  BUNDLE_ID="tech.sp33c.parla.dev" ;;
  prod|production) BUNDLE_ID="tech.sp33c.parla" ;;
  legacy) BUNDLE_ID="com.afitterling.sprachapp" ;;
  *.*)  BUNDLE_ID="$TARGET" ;;
  *)    echo "usage: $(basename "$0") <dev|prod|legacy|com.example.id>" >&2; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
APP_JSON="$APP_DIR/app.json"
PBXPROJ="$APP_DIR/ios/Parla.xcodeproj/project.pbxproj"
ENTITLEMENTS="$APP_DIR/ios/Parla/Parla.entitlements"
PLIST="$APP_DIR/ios/Parla/Info.plist"

for f in "$APP_JSON" "$PBXPROJ" "$ENTITLEMENTS" "$PLIST"; do
  [[ -f "$f" ]] || { echo "error: not found: $f" >&2; exit 1; }
done

CONTAINER_ID="iCloud.$BUNDLE_ID"

echo "→ bundle id $BUNDLE_ID"
echo "  container $CONTAINER_ID"

# 1) app.json — keep formatting stable (2-space indent, trailing newline).
python3 - "$APP_JSON" "$BUNDLE_ID" "$CONTAINER_ID" <<'PY'
import json, sys
path, bundle_id, container_id = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    d = json.load(f)
ios = d.setdefault("expo", {}).setdefault("ios", {})
ios["bundleIdentifier"] = bundle_id

ent = ios.setdefault("entitlements", {})
for key in ("com.apple.developer.icloud-container-identifiers",
            "com.apple.developer.ubiquity-container-identifiers"):
    ent[key] = [container_id]

# NSUbiquitousContainers is keyed by the container id — rename the key, keep
# whatever display settings are on it.
containers = ios.setdefault("infoPlist", {}).setdefault("NSUbiquitousContainers", {})
settings = next(iter(containers.values()), {
    "NSUbiquitousContainerIsDocumentScopePublic": True,
    "NSUbiquitousContainerName": "Parla",
    "NSUbiquitousContainerSupportedFolderLevels": "Any",
})
ios["infoPlist"]["NSUbiquitousContainers"] = {container_id: settings}

with open(path, "w") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"  app.json         {bundle_id}")
PY

# 2) project.pbxproj — every build configuration.
sed -i '' -E "s/(PRODUCT_BUNDLE_IDENTIFIER = )[^;]+;/\1$BUNDLE_ID;/g" "$PBXPROJ"
echo "  project.pbxproj  $BUNDLE_ID"

# 3) Native entitlements + Info.plist. Every `iCloud.<something>` string in these
# two files is a container id — the entitlement *keys* are lowercase "icloud",
# so a case-sensitive match leaves them alone.
for f in "$ENTITLEMENTS" "$PLIST"; do
  sed -i '' -E "s/iCloud\.[A-Za-z0-9.-]+/$CONTAINER_ID/g" "$f"
done
echo "  entitlements     $CONTAINER_ID"
echo "  Info.plist       $CONTAINER_ID"

echo "✓ bundle id set — rebuild for it to take effect"
