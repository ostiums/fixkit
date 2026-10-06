import CoreGraphics
import Foundation
import Testing
@testable import FixKit

@MainActor
struct FixRegistryTests {
    private func element(_ name: String, _ frame: CGRect) -> FixElement {
        FixElement(name: name, file: "/App/\(name).swift", line: 1, frame: frame)
    }

    @Test func innermostElementWins() {
        let registry = FixRegistry()
        registry.update(UUID(), element("card", CGRect(x: 0, y: 0, width: 300, height: 200)))
        registry.update(UUID(), element("card.name", CGRect(x: 20, y: 150, width: 120, height: 20)))

        #expect(registry.element(at: CGPoint(x: 40, y: 160))?.name == "card.name")
        #expect(registry.element(at: CGPoint(x: 250, y: 40))?.name == "card")
    }

    @Test func nothingMarkedUnderThePoint() {
        let registry = FixRegistry()
        registry.update(UUID(), element("card", CGRect(x: 0, y: 0, width: 300, height: 200)))

        #expect(registry.element(at: CGPoint(x: 10, y: 400)) == nil)
    }

    @Test func removedElementIsForgotten() {
        let registry = FixRegistry()
        let id = UUID()
        registry.update(id, element("card", CGRect(x: 0, y: 0, width: 300, height: 200)))
        registry.remove(id)

        #expect(registry.element(named: "card") == nil)
    }
}
