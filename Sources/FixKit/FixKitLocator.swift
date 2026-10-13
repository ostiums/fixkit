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
    /// Shapes, filled or stroked, colors and gradients: what backgrounds and overlays are drawn with.
    let isDecoration: Bool
    /// A spacer, or a modifier's `content`, which stands for the view the modifier is applied to.
    let isStandIn: Bool
    /// How many marked views hold it.
    let depth: Int
    /// A `.fixable`'s name: the mark stands for it, inside the view it names, and for no view.
    private(set) var fixable: String?
    /// Its place in the order SwiftUI paints the host's views, back to front.
    var order = 0

    init(fileID: String, source: FixSource, type: Any.Type, frame: CGRect, depth: Int) {
        self.fileID = fileID
        self.source = source
        self.type = type
        self.frame = frame
        self.depth = depth
        let view = FixLocator.unwrapped(type)
        isDecoration = view is any Shape.Type || view is any ShapeView.Type || view is any ShapeStyle.Type
        isStandIn = view is any FixStandIn.Type
    }

    init(fixable name: String, frame: CGRect, depth: Int) {
        self.init(fileID: "FixKit/FixKit.swift", source: FixSource(file: "", line: 0), type: EmptyView.self, frame: frame, depth: depth)
        fixable = name
    }

    /// Neither decoration nor a stand-in: a view drawn for its own sake.
    var isSolid: Bool { !isDecoration && !isStandIn }

    var module: Substring { fileID.prefix { $0 != "/" } }
}

/// Finds the SwiftUI view under a press among the source marks every view carries: where it is
/// written, the app's view around it and where that view is used.
@MainActor
enum FixLocator {
    /// The view under the point: the innermost mark there that is not decoration, named after the
    /// `.fixable` element or the app's own view around it. `marks` come in the order SwiftUI paints
    /// them, each view right before the views inside it; `clips` are the frames of the scroll views
    /// on screen.
    static func element(at point: CGPoint, among marks: [FixMark], clips: [CGRect]) -> FixElement? {
        let (marks, parents, fixables) = tree(of: marks)
        // Clipping only shrinks a frame, so marks away from the point are left out before it.
        let under = marks.compactMap { mark -> FixMark? in
            guard mark.frame.contains(point) else { return nil }
            var mark = mark
            mark.frame = clipped(mark.frame, to: clips)
            return mark.frame.contains(point) ? mark : nil
        }
        guard let pressed = pressed(among: under) else { return nil }
        // The pressed view and the views around it, nearest first: where they are written, whatever
        // their frames. An offset moves a view out of the one around it, a header pinned over a row
        // is still no part of it.
        let around = sequence(first: pressed.order) { parents[$0] }.map { marks[$0] }
        let components = components(among: around, modules: Set(marks.map(\.module)))
        return FixElement(
            name: name(of: pressed, around: around, component: components.first, fixables: fixables),
            source: pressed.source, frame: pressed.frame, usedAt: components.map(\.source))
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
    /// laid over the whole screen would win every press.
    private static func pressed(among under: [FixMark]) -> FixMark? {
        var candidates = under.sorted(by: isInner)
        while let candidate = candidates.first(where: { !givesWay($0, among: candidates) }) ?? candidates.first {
            // A view painted later that covers only part of the candidate is no view around it but
            // one drawn over it, such as a tab bar over a row scrolled under it.
            let covered = candidates.contains {
                $0.order > candidate.order && $0.isSolid && !holds($0.frame, candidate.frame)
            }
            if !covered { return candidate }
            candidates.removeAll { $0.order == candidate.order }
        }
        return nil
    }

    /// Whether the mark leaves the press to another view under the point. A stand-in always does.
    /// A shape or a colour does to a view painted over it, and to the view it fills or outlines
    /// exactly: drawn on its own, a progress bar or a status dot, it is what was pressed.
    private static func givesWay(_ mark: FixMark, among candidates: [FixMark]) -> Bool {
        if mark.isStandIn { return true }
        guard mark.isDecoration else { return false }
        return candidates.contains {
            $0.isSolid && ($0.order > mark.order || holds($0.frame, mark.frame) && holds(mark.frame, $0.frame))
        }
    }

    /// The app's marks, numbered in the order SwiftUI paints them; each one's parent, by its order: the
    /// nearest mark before it that is less deep, so a view whose own mark is missing leaves its views
    /// to the one around it; and the .fixable names, by the order of the view each is on. FixKit's
    /// own views are left out.
    private static func tree(of input: [FixMark]) -> (marks: [FixMark], parents: [Int?], fixables: [Int: String]) {
        var marks: [FixMark] = []
        var parents: [Int?] = []
        var fixables: [Int: String] = [:]
        var open: [FixMark] = []
        for var mark in input {
            while let last = open.last, last.depth >= mark.depth {
                open.removeLast()
            }
            if let name = mark.fixable {
                if let view = open.last { fixables[view.order] = name }
                continue
            }
            guard mark.module != "FixKit" else { continue }
            mark.order = marks.count
            parents.append(open.last?.order)
            open.append(mark)
            marks.append(mark)
        }
        return (marks, parents, fixables)
    }

    /// The app's own views around the pressed one, the nearest two: types declared in a module whose
    /// code carries marks.
    private static func components(among around: [FixMark], modules: Set<Substring>) -> [FixMark] {
        var seen: Set<FixSource> = [around[0].source]
        var components: [FixMark] = []
        for mark in around.dropFirst()
        // An app's own shape is still a background.
        where components.count < 2 && mark.isSolid && modules.contains(module(of: mark.type)) && seen.insert(mark.source).inserted {
            components.append(mark)
        }
        return components
    }

    /// `Component › Type`. A .fixable on the pressed view, the component or a view between them names
    /// it instead, the nearest one; on a view beside it or around the component it names another view.
    private static func name(of pressed: FixMark, around: [FixMark], component: FixMark?, fixables: [Int: String]) -> String {
        var owner = component.map { typeName($0.type) }
        for mark in around {
            if let fixable = fixables[mark.order] {
                owner = fixable
                break
            }
            if mark.order == component?.order { break }
        }
        let type = typeName(pressed.type)
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

    /// `TransactionRow` for `TransactionRow`, `HStack` for `HStack<TupleView<…>>`, `Capsule` for a
    /// filled or stroked capsule.
    private static func typeName(_ type: Any.Type) -> String {
        var view = unwrapped(type)
        if let shaped = view as? any ShapeView.Type {
            view = shape(of: shaped)
        }
        return String(String(describing: view).prefix { $0 != "<" })
    }

    private static func shape<Shaped: ShapeView>(of _: Shaped.Type) -> Any.Type {
        Shaped.Content.self
    }

    /// The module that declares the type, which for `Text` is SwiftUI's.
    private static func module(of type: Any.Type) -> Substring {
        String(reflecting: unwrapped(type)).prefix { $0 != "." }
    }
}

private protocol FixStandIn {}
extension Spacer: FixStandIn {}
extension _ViewModifier_Content: FixStandIn {}

private protocol FixModified {
    static var content: Any.Type { get }
}

extension ModifiedContent: FixModified {
    fileprivate static var content: Any.Type { Content.self }
}
#endif
