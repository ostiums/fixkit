// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "FixKit",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "FixKit", targets: ["FixKit"])
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
