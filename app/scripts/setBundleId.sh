#!/usr/bin/env bash
#
# Switch the app between its two identities so every source of truth moves
# together (same idea as setVersion.sh):
#   - app.json                              expo.ios.bundleIdentifier
#   - ios/Parla.xcodeproj/project.pbxproj    PRODUCT_BUNDLE_IDENTIFIER (Debug + Release)
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
# The iCloud container (iCloud.com.afitterling.sprachapp) deliberately stays the
# same for both: dev and prod builds share one synced library.
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

for f in "$APP_JSON" "$PBXPROJ"; do
  [[ -f "$f" ]] || { echo "error: not found: $f" >&2; exit 1; }
done

echo "→ bundle id $BUNDLE_ID"

# 1) app.json — keep formatting stable (2-space indent, trailing newline).
python3 - "$APP_JSON" "$BUNDLE_ID" <<'PY'
import json, sys
path, bundle_id = sys.argv[1], sys.argv[2]
with open(path) as f:
    d = json.load(f)
d.setdefault("expo", {}).setdefault("ios", {})["bundleIdentifier"] = bundle_id
with open(path, "w") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"  app.json         {bundle_id}")
PY

# 2) project.pbxproj — every build configuration.
sed -i '' -E "s/(PRODUCT_BUNDLE_IDENTIFIER = )[^;]+;/\1$BUNDLE_ID;/g" "$PBXPROJ"
echo "  project.pbxproj  $BUNDLE_ID"

echo "✓ bundle id set — rebuild for it to take effect"
