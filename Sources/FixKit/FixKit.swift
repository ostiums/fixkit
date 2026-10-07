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
/// Where a mark was declared.
struct FixSource: Equatable {
    let file: String
    let line: Int
}

struct FixElement: Equatable {
    let name: String
    /// Where a mark was declared; a UIKit view named after the property that holds it has none.
    let source: FixSource?
    var frame: CGRect

    /// Of overlapping elements, the innermost has the smallest frame.
    var area: CGFloat { frame.width * frame.height }
}

/// The marked elements: SwiftUI's with their frames in window coordinates as layout changes,
/// UIKit's by the view, whose frame is read when a press asks.
@MainActor
final class FixRegistry {
    static let shared = FixRegistry()

    var screen = ""
    private var elements: [UUID: FixElement] = [:]
    private var marks: [ObjectIdentifier: ViewMark] = [:]

    func update(_ id: UUID, _ element: FixElement) {
        elements[id] = element
    }

    func remove(_ id: UUID) {
        elements[id] = nil
    }

    func mark(_ view: UIView, name: String, source: FixSource) {
        // Released views leave entries behind; a cell marked on every reuse must not pay for a sweep each time.
        if marks.count.isMultiple(of: 64) {
            marks = marks.filter { $0.value.view != nil }
        }
        marks[ObjectIdentifier(view)] = ViewMark(view: view, name: name, source: source)
    }

    /// The mark on this very view, with its frame in its window now.
    func mark(on view: UIView) -> FixElement? {
        guard let mark = marks[ObjectIdentifier(view)], mark.view === view, let window = view.window else { return nil }
        return FixElement(name: mark.name, source: mark.source, frame: view.frame(in: window))
    }

    /// A marked element on screen, by its name: what a scripted press aims at.
    func element(named name: String) -> FixElement? {
        if let element = elements.values.first(where: { $0.name == name }) { return element }
        let found = marks.values.first { $0.name == name && $0.view?.isShown == true }
        return found?.view.flatMap(mark(on:))
    }

    /// The innermost SwiftUI mark under the point. UIKit marks are found along the pressed view's
    /// superviews instead, by FixInspector.
    func element(at point: CGPoint) -> FixElement? {
        elements.values.filter { $0.frame.contains(point) }.min { $0.area < $1.area }
    }
}

/// A mark on a UIKit view, held weakly so a released view simply drops out.
private struct ViewMark {
    weak var view: UIView?
    let name: String
    let source: FixSource
}

extension UIView {
    /// The view and the views around it, up to and including its window.
    var ancestors: some Sequence<UIView> {
        sequence(first: self, next: \.superview)
    }

    /// The view itself is neither hidden nor fully transparent.
    var isVisible: Bool {
        !isHidden && alpha > 0.01
    }

    /// Nothing hides the view: neither it nor any view around it.
    var isShown: Bool {
        ancestors.allSatisfy(\.isVisible)
    }

    func frame(in window: UIWindow) -> CGRect {
        convert(bounds, to: window)
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
                FixRegistry.shared.update(
                    id, FixElement(name: name, source: FixSource(file: file, line: line), frame: frame))
            }
            .onDisappear { FixRegistry.shared.remove(id) }
    }
}
#endif
