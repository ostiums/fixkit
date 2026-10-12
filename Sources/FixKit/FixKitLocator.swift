#if DEBUG
import SwiftUI

/// A view's source mark with its frame in the window.
struct FixMark {
    /// `Module/File.swift`.
    let fileID: String
    let source: FixSource
    /// The view expression's type, `ModifiedContent` and all.
    let type: Any.Type
    var frame: CGRect

    var module: Substring { fileID.prefix { $0 != "/" } }
    var area: CGFloat { frame.width * frame.height }
}

/// Finds the SwiftUI view under a press among the source marks every view carries: where it is
/// written, the app's view around it and where that view is used.
@MainActor
enum FixLocator {
    /// The SwiftUI view under the point in the app's window, or nil when no hosting controller draws
    /// there or the app is built without the SourceLocations trait.
    static func element(at point: CGPoint, in window: UIWindow, fixable: FixElement?) -> FixElement? {
        #if SourceLocations
        guard let host = host(at: point, in: window) else { return nil }
        return element(
            at: point, among: marks(of: host, in: window), clips: scrollFrames(in: host.view, window: window),
            fixable: fixable)
        #else
        nil
        #endif
    }

    #if SourceLocations
    /// The hosting controller under the point: the first view controller up from the view the
    /// window's hit test finds, when it hosts SwiftUI; UIKit content such as a navigation bar has
    /// none. When the hit test finds nothing, the topmost hosting controller whose view holds the point.
    private static func host(at point: CGPoint, in window: UIWindow) -> (UIViewController & FixIdentifiedViews)? {
        if let hit = window.hitTest(point, with: nil), hit !== window {
            let controller = sequence(first: hit as UIResponder, next: \.next).first { $0 is UIViewController }
            return controller as? UIViewController & FixIdentifiedViews
        }
        guard let root = window.rootViewController else { return nil }
        let found = controllers(from: root).last {
            $0 is FixIdentifiedViews && $0.view.window === window && $0.view.isShown
                && $0.view.frame(in: window).contains(point)
        }
        return found as? UIViewController & FixIdentifiedViews
    }

    /// The controller, its children and what it presents, each before what it holds.
    private static func controllers(from controller: UIViewController) -> [UIViewController] {
        var all = [controller]
        for child in controller.children {
            all += controllers(from: child)
        }
        if let presented = controller.presentedViewController, presented.presentingViewController === controller {
            all += controllers(from: presented)
        }
        return all
    }

    /// The host's marks with their frames in the window, in the order SwiftUI paints them.
    private static func marks(of host: UIViewController & FixIdentifiedViews, in window: UIWindow) -> [FixMark] {
        var marks: [FixMark] = []
        host._forEachIdentifiedView { proxy in
            guard let mark = proxy.identifier.base as? FixSourceMark else { return }
            marks.append(
                FixMark(
                    fileID: mark.fileID, source: FixSource(file: mark.file, line: mark.line), type: mark.type,
                    frame: host.view.convert(proxy.boundingRect, to: window)))
        }
        return marks
    }

    /// The visible region of every scroll view shown inside the view, in the window.
    private static func scrollFrames(in view: UIView, window: UIWindow) -> [CGRect] {
        guard view.isVisible else { return [] }
        let own = view is UIScrollView ? [view.frame(in: window)] : []
        return own + view.subviews.flatMap { scrollFrames(in: $0, window: window) }
    }
    #endif

    /// The view under the point: the innermost mark there that is not decoration, named after the
    /// `.fixable` element or the app's own view around it. `marks` come in the order SwiftUI paints
    /// them; `clips` are the frames of the scroll views on screen.
    static func element(at point: CGPoint, among marks: [FixMark], clips: [CGRect], fixable: FixElement?) -> FixElement? {
        let marks = marks.compactMap { mark -> FixMark? in
            guard mark.module != "FixKit" else { return nil }
            var mark = mark
            mark.frame = clipped(mark.frame, to: clips)
            return mark.frame.isEmpty ? nil : mark
        }
        // Innermost first: of nested marks the smallest, of equal ones the later painted, which
        // SwiftUI enumerates after the views around it. Not the last painted alone: a transparent
        // container laid over the whole screen would win every press.
        var under = marks.enumerated()
            .filter { $0.element.frame.contains(point) }
            .sorted { ($0.element.area, $1.offset) < ($1.element.area, $0.offset) }
        var pressed: (offset: Int, element: FixMark)?
        while let candidate = under.first(where: { !isDecoration($0.element.type) }) ?? under.first {
            // A view painted later that covers only part of the candidate is no view around it but
            // one drawn over it, such as a tab bar over a row scrolled under it.
            let covered = under.contains {
                $0.offset > candidate.offset && !isDecoration($0.element.type) && !holds($0.element.frame, candidate.element.frame)
            }
            guard covered else {
                pressed = candidate
                break
            }
            under.removeAll { $0.offset == candidate.offset }
        }
        guard let (index, pressed) = pressed else { return nil }
        // The views around it are painted before it.
        let around = under.filter { $0.offset < index && holds($0.element.frame, pressed.frame) }.map(\.element)

        // The app's own views around it: types declared in a module whose code carries marks. An
        // app's own shape is still a background.
        let modules = Set(marks.map(\.module))
        var components: [FixMark] = []
        for mark in around
        where modules.contains(module(of: mark.type)) && !isDecoration(mark.type) && mark.source != pressed.source
            && !components.contains(where: { $0.source == mark.source }) {
            components.append(mark)
        }
        let component = components.first
        // A .fixable name stands for the component when it marks the pressed view, the component or
        // a view between them.
        let owner = if let fixable, holds(fixable.frame, pressed.frame), component.map({ holds($0.frame, fixable.frame) }) ?? true {
            fixable.name
        } else {
            component.map { name(of: $0.type) }
        }
        let type = name(of: pressed.type)
        return FixElement(
            name: owner.map { "\($0) › \(type)" } ?? type, source: pressed.source, frame: pressed.frame,
            usedAt: components.prefix(2).map(\.source))
    }

    /// Whether the outer frame holds the inner one, give or take a point.
    private static func holds(_ outer: CGRect, _ inner: CGRect) -> Bool {
        outer.insetBy(dx: -1, dy: -1).contains(inner)
    }

    /// The frame cut to each scroll view it crosses without containing it: content scrolled past a
    /// scroll view's edge is not on screen there.
    static func clipped(_ frame: CGRect, to clips: [CGRect]) -> CGRect {
        clips.reduce(frame) { frame, clip in
            !frame.intersects(clip) || holds(frame, clip) ? frame : frame.intersection(clip)
        }
    }

    /// The type with SwiftUI's `ModifiedContent` taken off: `Text` for `Text("a").padding()`.
    private static func unwrapped(_ type: Any.Type) -> Any.Type {
        var type = type
        while let modified = type as? any FixModified.Type {
            type = modified.content
        }
        return type
    }

    /// Shapes, filled or stroked, colors, gradients and spacers: what backgrounds and overlays are
    /// drawn with.
    private static func isDecoration(_ type: Any.Type) -> Bool {
        let type = unwrapped(type)
        return type is any Shape.Type || type is any ShapeView.Type || type is any ShapeStyle.Type || type is Spacer.Type
    }

    /// `TransactionRow` for `TransactionRow`, `HStack` for `HStack<TupleView<…>>`.
    private static func name(of type: Any.Type) -> String {
        String(String(describing: unwrapped(type)).prefix { $0 != "<" })
    }

    private static func module(of type: Any.Type) -> Substring {
        String(reflecting: unwrapped(type)).prefix { $0 != "." }
    }
}

#if SourceLocations
/// What Xcode Previews' selection reads: every UIHostingController has it, whatever its root view.
@MainActor
private protocol FixIdentifiedViews {
    func _forEachIdentifiedView(body: (_IdentifiedViewProxy) -> Void)
}

extension UIHostingController: FixIdentifiedViews {}
#endif

private protocol FixModified {
    static var content: Any.Type { get }
}

extension ModifiedContent: FixModified {
    fileprivate static var content: Any.Type { Content.self }
}

#endif
