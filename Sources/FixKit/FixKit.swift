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
    /// Where a mark was declared; an element FixInspector named after its property has none.
    let file: String?
    let line: Int?
    var frame: CGRect
}

/// The marked elements currently on screen, with their frames in window coordinates.
@MainActor
final class FixRegistry {
    static let shared = FixRegistry()

    var screen = ""
    private var elements: [UUID: FixElement] = [:]
    private var views: [ObjectIdentifier: ViewMark] = [:]

    func update(_ id: UUID, _ element: FixElement) {
        elements[id] = element
    }

    func remove(_ id: UUID) {
        elements[id] = nil
    }

    /// Marks a UIKit view; its frame is read whenever a press asks, so nothing follows layout.
    func mark(_ view: UIView, name: String, file: String, line: Int) {
        views = views.filter { $0.value.view != nil }
        views[ObjectIdentifier(view)] = ViewMark(view: view, name: name, file: file, line: line)
    }

    /// Every marked element on screen now, SwiftUI's and UIKit's.
    private var onScreen: [FixElement] {
        Array(elements.values) + views.values.compactMap(\.element)
    }

    func element(named name: String) -> FixElement? {
        onScreen.first { $0.name == name }
    }

    /// The innermost element under the point: the smallest frame that contains it. Given the
    /// window, a UIKit mark counts only on the path of the view a touch there would reach, so a
    /// mark on the screen under a sheet does not win a press inside the sheet.
    func element(at point: CGPoint, in window: UIWindow? = nil) -> FixElement? {
        let hit = window?.hitTest(point, with: nil)
        let marks = views.values.filter { mark in
            guard let hit, let view = mark.view else { return true }
            return hit.isDescendant(of: view) || view.isDescendant(of: hit)
        }
        return (Array(elements.values) + marks.compactMap(\.element))
            .filter { $0.frame.contains(point) }
            .min { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
    }
}

/// A mark on a UIKit view, held weakly so a released view simply drops out.
@MainActor
private final class ViewMark {
    weak var view: UIView?
    let name: String
    let file: String
    let line: Int

    init(view: UIView, name: String, file: String, line: Int) {
        self.view = view
        self.name = name
        self.file = file
        self.line = line
    }

    /// The view's frame in its window, while it is in one and nothing hides it.
    var element: FixElement? {
        guard let view, let window = view.window, view.isShown else { return nil }
        return FixElement(name: name, file: file, line: line, frame: view.convert(view.bounds, to: window))
    }
}

extension UIView {
    /// Neither the view nor any view around it is hidden or fully transparent.
    var isShown: Bool {
        sequence(first: self, next: \.superview).allSatisfy { !$0.isHidden && $0.alpha > 0.01 }
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
