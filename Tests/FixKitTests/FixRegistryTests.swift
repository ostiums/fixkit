import CoreGraphics
import Foundation
import Testing
import UIKit
@testable import FixKit

@MainActor
struct FixRegistryTests {
    private func element(_ name: String, _ frame: CGRect) -> FixElement {
        FixElement(name: name, source: FixSource(file: "/App/\(name).swift", line: 1), frame: frame)
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

    private func window(_ views: UIView...) -> UIWindow {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        // A window starts out hidden, and nothing in a hidden window is on screen.
        window.isHidden = false
        views.forEach(window.addSubview)
        return window
    }

    @Test func markedViewReportsItsFrameInTheWindow() {
        let registry = FixRegistry()
        let card = UIView(frame: CGRect(x: 20, y: 100, width: 300, height: 200))
        let name = UILabel(frame: CGRect(x: 10, y: 150, width: 120, height: 20))
        card.addSubview(name)
        let window = window(card)
        registry.mark(name, name: "card.name", source: FixSource(file: "/App/CardView.swift", line: 12))

        let element = registry.mark(on: name)
        #expect(element?.name == "card.name")
        #expect(element?.source?.line == 12)
        #expect(element?.frame == CGRect(x: 30, y: 250, width: 120, height: 20))
        #expect(registry.mark(on: card) == nil)
        withExtendedLifetime(window) {}
    }

    @Test func aScriptedPressFindsOnlyShownMarks() {
        let registry = FixRegistry()
        let tab = UIView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let button = UIButton(frame: CGRect(x: 10, y: 10, width: 100, height: 44))
        tab.addSubview(button)
        let window = window(tab)
        registry.mark(button, name: "button", source: FixSource(file: "/App/Tab.swift", line: 1))
        #expect(registry.element(named: "button") != nil)

        tab.isHidden = true
        #expect(registry.element(named: "button") == nil)
        tab.isHidden = false
        tab.alpha = 0
        #expect(registry.element(named: "button") == nil)
        tab.alpha = 1
        button.removeFromSuperview()
        #expect(registry.element(named: "button") == nil)
        withExtendedLifetime(window) {}
    }

    @Test func markingAgainReplacesTheMark() {
        let registry = FixRegistry()
        let label = UILabel(frame: CGRect(x: 0, y: 0, width: 100, height: 20))
        let window = window(label)
        registry.mark(label, name: "old", source: FixSource(file: "/App/A.swift", line: 1))
        registry.mark(label, name: "new", source: FixSource(file: "/App/A.swift", line: 2))

        #expect(registry.element(named: "old") == nil)
        #expect(registry.element(named: "new")?.source?.line == 2)
        withExtendedLifetime(window) {}
    }
}
