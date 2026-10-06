import SwiftUI

// FixKit: long press anything in a debug build running in the simulator, type what is
// wrong, and the report goes to the Claude Code session listening on this Mac through
// the fixkit mod. Release builds compile all of it away.

extension View {
    /// Optional: names an element and records the source line it was declared on, so its
    /// reports point at that line. Unmarked elements are reported through accessibility.
    public func fixable(_ name: String, file: String = #filePath, line: Int = #line) -> some View {
        #if DEBUG
        modifier(FixableModifier(name: name, file: file, line: line))
        #else
        self
        #endif
    }

    /// Optional: names the screen on display, sent along with each report.
    public func fixScreen(_ name: String) -> some View {
        #if DEBUG
        onChange(of: name, initial: true) { FixRegistry.shared.screen = name }
        #else
        self
        #endif
    }

    /// Installs the long-press gesture, the report composer and the status banners.
    /// Apply once, to the root view of the app's main window.
    public func fixKitHost() -> some View {
        #if DEBUG
        modifier(FixKitHostModifier())
        #else
        self
        #endif
    }
}

#if DEBUG
struct FixElement: Equatable {
    let name: String
    let file: String
    let line: Int
    var frame: CGRect
}

/// The marked elements currently on screen, with their frames in window coordinates.
@MainActor
final class FixRegistry {
    static let shared = FixRegistry()

    var screen = ""
    private var elements: [UUID: FixElement] = [:]

    func update(_ id: UUID, _ element: FixElement) {
        elements[id] = element
    }

    func remove(_ id: UUID) {
        elements[id] = nil
    }

    func element(named name: String) -> FixElement? {
        elements.values.first { $0.name == name }
    }

    /// The innermost element under the point: the smallest frame that contains it.
    func element(at point: CGPoint) -> FixElement? {
        elements.values
            .filter { $0.frame.contains(point) }
            .min { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
    }
}

private struct FixableModifier: ViewModifier {
    let name: String
    let file: String
    let line: Int

    @State private var id = UUID()

    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
                FixRegistry.shared.update(id, FixElement(name: name, file: file, line: line, frame: frame))
            }
            .onDisappear { FixRegistry.shared.remove(id) }
    }
}
#endif
