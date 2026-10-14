import Testing
@testable import FixKit

struct FixCopiesTests {
    @Test func oneCopyIsFound() {
        #expect(FixCopies.copies().count == 1)
    }

    @Test func oneCopyNeedsNoWarning() {
        #expect(FixCopies.warning(for: ["/App.app/Frameworks/Feature.framework/Feature"]) == nil)
    }

    @Test func copiesAreNamedByTheirFrameworks() throws {
        let warning = try #require(FixCopies.warning(for: [
            "/App.app/Frameworks/Feature.framework/Feature",
            "/App.app/Frameworks/Profile.framework/Profile",
            "/App.app/App.debug.dylib",
        ]))

        #expect(warning.hasPrefix("FixKit is linked into Feature.framework, Profile.framework and App.debug.dylib:"))
        #expect(warning.contains(#"PackageSettings(productTypes: ["FixKit": .framework])"#))
    }
}
