#if DEBUG
import Foundation
import MachO

/// Every copy of FixKit exports this symbol, so a binary that resolves it to itself holds a copy.
/// Public, so it is exported whether or not the build is testable.
@_cdecl("fixkit_copy_marker")
public func _fixKitCopyMarker() {}

/// FixKit linked statically into several dynamic frameworks leaves a copy in each. The copy the app
/// installs knows only its own marks, so the views of the other frameworks are named where they are used.
@MainActor
enum FixCopies {
    private static var checked = false

    /// Says once, in the console, when FixKit is linked more than once.
    static func check() {
        guard !checked else { return }
        checked = true
        if let warning = warning(for: copies()) {
            print(warning)
        }
    }

    /// The loaded binaries that hold a copy of FixKit; the system's are skipped.
    nonisolated static func copies() -> [String] {
        var copies: [String] = []
        for index in 0..<_dyld_image_count() {
            guard let name = _dyld_get_image_name(index).map(String.init(cString:)),
                  !name.contains("/System/Library/"), !name.contains("/usr/lib/"),
                  let handle = dlopen(name, RTLD_NOLOAD | RTLD_LAZY)
            else { continue }
            defer { dlclose(handle) }
            // dlsym also searches the image's dependencies: only a marker inside the image itself counts.
            var info = Dl_info()
            guard let marker = dlsym(handle, "fixkit_copy_marker"), dladdr(marker, &info) != 0,
                  let file = info.dli_fname.map(String.init(cString:)), file == name, !copies.contains(file)
            else { continue }
            copies.append(file)
        }
        return copies
    }

    /// The console line for more than one copy, naming a framework's copy by its framework.
    nonisolated static func warning(for copies: [String]) -> String? {
        guard copies.count > 1 else { return nil }
        let names = copies.map { path in
            path.split(separator: "/").first { $0.hasSuffix(".framework") }.map(String.init)
                ?? (path as NSString).lastPathComponent
        }
        let list = names.dropLast().joined(separator: ", ") + " and " + names.last!
        return """
            FixKit is linked into \(list): SwiftUI views in all but one of them are named where \
            they are used, not on their own line. Link FixKit once: with Tuist, \
            PackageSettings(productTypes: ["FixKit": .framework]); in Xcode, make it a dynamic \
            framework they depend on.
            """
    }
}
#endif
