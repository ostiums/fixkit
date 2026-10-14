#if DEBUG
import Foundation
import MachO

/// Every copy of FixKit exports this symbol, so a binary that resolves it to itself holds a copy.
@_cdecl("fixkit_copy_marker")
func fixKitCopyMarker() {}

/// FixKit linked statically into several dynamic frameworks leaves a copy in each. The copy the app
/// installs knows only its own marks, so the views of the other frameworks lose their lines.
enum FixCopies {
    /// Says once, in the console, when FixKit is linked more than once.
    static func check() {
        if let warning = warning(for: images()) {
            print(warning)
        }
    }

    /// The loaded binaries that hold a copy of FixKit; the system's are skipped.
    static func images() -> [String] {
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

    static func warning(for images: [String]) -> String? {
        guard images.count > 1 else { return nil }
        let names = images.map { path in
            path.split(separator: "/").first { $0.hasSuffix(".framework") }.map(String.init)
                ?? (path as NSString).lastPathComponent
        }
        let list = names.dropLast().joined(separator: ", ") + " and " + names.last!
        return """
            FixKit is linked into \(list): SwiftUI views in all but one of them are reported where \
            they are used, not on their own line. Link FixKit once: with Tuist, \
            PackageSettings(productTypes: ["FixKit": .framework]); in Xcode, make it a dynamic \
            framework they depend on.
            """
    }
}
#endif
