#!/bin/bash
# Runs every check: the mod's manifests and tests, the receiver's lookup, the Swift package's
# tests, and Tally built against the package in Debug and Release. SIMULATOR names the
# simulator to use (iPhone 18 Pro when not set).
set -euo pipefail
cd "$(dirname "$0")/.."

claude plugin validate .
claude plugin validate mod
claude plugin test mod
node --test mod/tests/*.node.test.mjs

# Beside Tally.xcodeproj, xcodebuild would build the project; the package's tests run from a
# folder that holds nothing but the package.
package=$(mktemp -d)
trap 'rm -rf "$package"' EXIT
ln -s "$PWD/Package.swift" "$PWD/Sources" "$PWD/Tests" "$package/"
SIMULATOR=${SIMULATOR:-iPhone 18 Pro}
(cd "$package" && xcodebuild -scheme FixKit -destination "platform=iOS Simulator,name=$SIMULATOR" -quiet test)

for configuration in Debug Release; do
  xcodebuild -project Tally.xcodeproj -scheme Tally -configuration "$configuration" \
    -destination "platform=iOS Simulator,name=$SIMULATOR" -derivedDataPath "$package/build" -quiet build
done
