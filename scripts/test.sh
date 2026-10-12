#!/bin/bash
# Runs every check: the mod's manifests and tests, the receiver's lookup and sources, the React
# Native package's tests, the Flutter package's tests and analysis, the Swift package's tests, and
# Tally built against the package in Debug and Release. SIMULATOR names the simulator to use
# (iPhone 18 Pro when not set).
set -euo pipefail
cd "$(dirname "$0")/.."

claude plugin validate .
claude plugin validate mod
claude plugin test mod
node --test mod/tests/*.node.test.mjs
# The React Native package's pure parts; Node runs their TypeScript as is (22.18 or later).
node --test react-native/tests/*.test.ts
# The Flutter package's tests and analysis, and the example's, where Flutter is installed.
if command -v flutter >/dev/null; then
  (cd flutter && flutter test && flutter analyze lib test)
  (cd flutter/example && flutter analyze && flutter test)
else
  echo "flutter is not installed: skipping the Flutter package"
fi

# Beside Tally.xcodeproj, xcodebuild would build the project; the package's tests run from a
# folder that holds nothing but the package.
package=$(mktemp -d)
trap 'rm -rf "$package"' EXIT
ln -s "$PWD/Package.swift" "$PWD/Sources" "$PWD/Tests" "$package/"
SIMULATOR=${SIMULATOR:-iPhone 18 Pro}
(cd "$package" && xcodebuild -scheme FixKit -destination "platform=iOS Simulator,name=$SIMULATOR" -quiet test)
# The package without its default trait, as an app that turns source locations off builds it.
(cd "$package" && xcrun swift build -q --disable-default-traits \
  --sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" --triple arm64-apple-ios17.0-simulator)

for configuration in Debug Release; do
  xcodebuild -project Tally.xcodeproj -scheme Tally -configuration "$configuration" \
    -destination "platform=iOS Simulator,name=$SIMULATOR" -derivedDataPath "$package/build" -quiet build
done
