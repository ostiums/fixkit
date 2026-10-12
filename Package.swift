// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "FixKit",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "FixKit", targets: ["FixKit"])
    ],
    traits: [
        .trait(
            name: "SourceLocations",
            description: "Every SwiftUI view carries the file and line it is written on, so reports point at it without .fixable"
        ),
        .default(enabledTraits: ["SourceLocations"]),
    ],
    targets: [
        .target(
            name: "FixKit",
            // The SDK compiles away in release builds, whatever flags the app's project sets.
            swiftSettings: [.define("DEBUG", .when(configuration: .debug))]
        ),
        .testTarget(name: "FixKitTests", dependencies: ["FixKit"]),
    ]
)
