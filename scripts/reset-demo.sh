#!/bin/bash
# Puts the seeded UI bugs back and relaunches the app on the Home tab: run before each take.
# SIMULATOR names the simulator to use (iPhone 18 Pro when not set).
set -euo pipefail
cd "$(dirname "$0")/.."

SIMULATOR=${SIMULATOR:-iPhone 18 Pro}
UDID=$(xcrun simctl list devices available | grep -m1 "$SIMULATOR (" | grep -oE '[0-9A-F-]{36}')

git checkout demo-start -- Tally
xcrun simctl boot "$UDID" 2>/dev/null || true
# A fresh install forgets the last open tab, so the app starts on Home.
xcrun simctl uninstall "$UDID" dev.tally.Tally 2>/dev/null || true
rm -rf .fixkit/reports

# Xcode 27 shows simulators in Device Hub; earlier versions in Simulator.
open -ga DeviceHub 2>/dev/null || open -ga Simulator 2>/dev/null || true
xcodebuild -project Tally.xcodeproj -scheme Tally -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath .build/DerivedData -quiet build
xcrun simctl install "$UDID" .build/DerivedData/Build/Products/Debug-iphonesimulator/Tally.app
xcrun simctl launch "$UDID" dev.tally.Tally
