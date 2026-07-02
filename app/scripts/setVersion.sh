#!/usr/bin/env bash
#
# Set the app's marketing version and build number across every source of truth
# so app.json, the Info.plist and the Xcode project never drift apart:
#   - app.json                        expo.version, expo.ios.buildNumber
#   - ios/Parla/Info.plist            CFBundleShortVersionString, CFBundleVersion
#   - ios/Parla.xcodeproj/project.pbxproj   MARKETING_VERSION, CURRENT_PROJECT_VERSION
#
# Usage:
#   scripts/setVersion.sh <version> [build]
#   scripts/setVersion.sh 1.2.0        # keeps <version>, bumps build = current + 1
#   scripts/setVersion.sh 1.2.0 7      # sets build = 7
#
set -euo pipefail

VERSION="${1:-}"
BUILD="${2:-}"

if [[ -z "$VERSION" ]]; then
  echo "usage: $(basename "$0") <version> [build]" >&2
  exit 1
fi
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: version must look like 1.2.0 (got '$VERSION')" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
APP_JSON="$APP_DIR/app.json"
PLIST="$APP_DIR/ios/Parla/Info.plist"
PBXPROJ="$APP_DIR/ios/Parla.xcodeproj/project.pbxproj"
PLISTBUDDY=/usr/libexec/PlistBuddy

for f in "$APP_JSON" "$PLIST" "$PBXPROJ"; do
  [[ -f "$f" ]] || { echo "error: not found: $f" >&2; exit 1; }
done

# Default build = current CFBundleVersion + 1.
if [[ -z "$BUILD" ]]; then
  CUR="$("$PLISTBUDDY" -c "Print :CFBundleVersion" "$PLIST" 2>/dev/null || echo 0)"
  if [[ "$CUR" =~ ^[0-9]+$ ]]; then BUILD=$((CUR + 1)); else BUILD=1; fi
fi
if [[ ! "$BUILD" =~ ^[0-9]+$ ]]; then
  echo "error: build must be an integer (got '$BUILD')" >&2
  exit 1
fi

echo "→ version $VERSION  build $BUILD"

# 1) app.json — keep formatting stable (2-space indent, trailing newline).
python3 - "$APP_JSON" "$VERSION" "$BUILD" <<'PY'
import json, sys
path, version, build = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    d = json.load(f)
e = d.setdefault("expo", {})
e["version"] = version
e.setdefault("ios", {})["buildNumber"] = build
with open(path, "w") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"  app.json         {version} ({build})")
PY

# 2) Info.plist
"$PLISTBUDDY" -c "Set :CFBundleShortVersionString $VERSION" "$PLIST"
"$PLISTBUDDY" -c "Set :CFBundleVersion $BUILD" "$PLIST"
echo "  Info.plist       $VERSION ($BUILD)"

# 3) project.pbxproj — every build configuration.
sed -i '' -E "s/(MARKETING_VERSION = )[^;]+;/\1$VERSION;/g" "$PBXPROJ"
sed -i '' -E "s/(CURRENT_PROJECT_VERSION = )[^;]+;/\1$BUILD;/g" "$PBXPROJ"
echo "  project.pbxproj  $VERSION ($BUILD)"

echo "✓ version set"
