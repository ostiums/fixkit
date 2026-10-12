#if DEBUG
import SwiftUI

/// A view's source mark with its frame in the window.
struct FixMark {
    /// `Module/File.swift`: the module the view is written in.
    let fileID: String
    let source: FixSource
    /// The view expression's type, `ModifiedContent` and all.
    let type: Any.Type
    var frame: CGRect
    /// Shapes, filled or stroked, colors, gradients and spacers: what backgrounds and overlays are
    /// drawn with.
    let isDecoration: Bool
    /// Its place in the order SwiftUI paints the host's views, back to front.
    var order = 0

    init(fileID: String, source: FixSource, type: Any.Type, frame: CGRect) {
        self.fileID = fileID
        self.source = source
        self.type = type
        self.frame = frame
        let view = FixLocator.unwrapped(type)
        isDecoration = view is any Shape.Type || view is any ShapeView.Type || view is any ShapeStyle.Type
            || view is Spacer.Type
    }

    var module: Substring { fileID.prefix { $0 != "/" } }
}

/// Finds the SwiftUI view under a press among the source marks every view carries: where it is
/// written, the app's view around it and where that view is used.
@MainActor
enum FixLocator {
    /// The view under the point: the innermost mark there that is not decoration, named after the
    /// `.fixable` element or the app's own view around it. `marks` come in the order SwiftUI paints
    /// them; `clips` are the frames of the scroll views on screen.
    static func element(at point: CGPoint, among marks: [FixMark], clips: [CGRect], fixable: FixElement?) -> FixElement? {
        let marks = marks.enumerated().compactMap { order, mark -> FixMark? in
            guard mark.module != "FixKit" else { return nil }
            var mark = mark
            mark.order = order
            return mark
        }
        // Clipping only shrinks a frame, so marks away from the point are left out before it.
        let under = marks.compactMap { mark -> FixMark? in
            guard mark.frame.contains(point) else { return nil }
            var mark = mark
            mark.frame = clipped(mark.frame, to: clips)
            return mark.frame.contains(point) ? mark : nil
        }
        guard let pressed = pressed(among: under) else { return nil }
        let components = components(around: pressed, among: under, modules: Set(marks.map(\.module)))
        return FixElement(
            name: name(of: pressed, in: components.first, fixable: fixable), source: pressed.source,
            frame: pressed.frame, usedAt: components.map(\.source))
    }

    /// Of the SwiftUI view and the UIKit view found under a press, the inner one: a UIKit view inside
    /// a SwiftUI one, a `UIViewRepresentable`'s say, names itself, and so does a SwiftUI view inside
    /// a UIKit container.
    static func inner(_ located: FixElement?, _ inspected: FixElement?) -> FixElement? {
        guard let located, let inspected else { return located ?? inspected }
        return inspected.area <= located.area ? inspected : located
    }

    /// Innermost first: of nested marks the smallest, of equal ones the later painted, which SwiftUI
    /// enumerates after the views around it. Not the last painted alone: a transparent container
    /// laid over the whole screen would win every press. Decoration only when nothing else is there.
    private static func pressed(among under: [FixMark]) -> FixMark? {
        var candidates = under.sorted(by: isInner)
        while let candidate = candidates.first(where: { !$0.isDecoration }) ?? candidates.first {
            // A view painted later that covers only part of the candidate is no view around it but
            // one drawn over it, such as a tab bar over a row scrolled under it.
            let covered = candidates.contains {
                $0.order > candidate.order && !$0.isDecoration && !holds($0.frame, candidate.frame)
            }
            if !covered { return candidate }
            candidates.removeAll { $0.order == candidate.order }
        }
        return nil
    }

    /// The app's own views around the pressed one, the nearest two: types declared in a module whose
    /// code carries marks. Views around it are painted before it and hold it.
    private static func components(around pressed: FixMark, among under: [FixMark], modules: Set<Substring>) -> [FixMark] {
        var seen: Set<FixSource> = [pressed.source]
        var components: [FixMark] = []
        for mark in under.sorted(by: isInner)
        where components.count < 2 && mark.order < pressed.order && holds(mark.frame, pressed.frame)
            // An app's own shape is still a background.
            && !mark.isDecoration && modules.contains(module(of: mark.type)) && seen.insert(mark.source).inserted {
            components.append(mark)
        }
        return components
    }

    /// `Component › Type`. A .fixable name stands for the component when it marks the pressed view,
    /// the component or a view between them.
    private static func name(of pressed: FixMark, in component: FixMark?, fixable: FixElement?) -> String {
        let owner = if let fixable, holds(fixable.frame, pressed.frame), component.map({ holds($0.frame, fixable.frame) }) ?? true {
            fixable.name
        } else {
            component.map { name(of: $0.type) }
        }
        let type = name(of: pressed.type)
        return owner.map { "\($0) › \(type)" } ?? type
    }

    private static func isInner(_ a: FixMark, _ b: FixMark) -> Bool {
        (a.frame.area, b.order) < (b.frame.area, a.order)
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
    nonisolated static func unwrapped(_ type: Any.Type) -> Any.Type {
        var type = type
        while let modified = type as? any FixModified.Type {
            type = modified.content
        }
        return type
    }

    /// `TransactionRow` for `TransactionRow`, `HStack` for `HStack<TupleView<…>>`.
    private static func name(of type: Any.Type) -> String {
        String(String(describing: unwrapped(type)).prefix { $0 != "<" })
    }

    /// The module that declares the type, which for `Text` is SwiftUI's.
    private static func module(of type: Any.Type) -> Substring {
        String(reflecting: unwrapped(type)).prefix { $0 != "." }
    }
}

private protocol FixModified {
    static var content: Any.Type { get }
}

extension ModifiedContent: FixModified {
    fileprivate static var content: Any.Type { Content.self }
}
#endif
