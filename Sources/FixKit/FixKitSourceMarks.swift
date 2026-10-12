#if DEBUG
import SwiftUI

#if SourceLocations
/// Where a view expression is written, and its type. Every view a `@ViewBuilder` or `body` builds
/// carries one through the identifier Xcode Previews' selection uses; FixLocator reads them back.
/// Static strings keep it plain data: SwiftUI copies and compares it on every update of every view.
public struct FixSourceMark: Hashable {
    /// `Module/File.swift`: the module tells FixKit's own views and the app's types apart.
    let fileID: StaticString
    let file: StaticString
    let line: Int
    let type: Any.Type

    public static func == (a: Self, b: Self) -> Bool {
        a.line == b.line && a.type == b.type && a.file.utf8Start == b.file.utf8Start
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(line)
        hasher.combine(ObjectIdentifier(type))
    }
}

extension ViewBuilder {
    /// ViewBuilder declares no buildExpression of its own, so this one sees every view expression
    /// in every module that imports FixKit.
    public static func buildExpression<Content: View>(
        _ content: Content, fileID: StaticString = #fileID, file: StaticString = #filePath, line: Int = #line
    ) -> ModifiedContent<Content, _IdentifiedModifier<FixSourceMark>> {
        content.modifier(
            _IdentifiedModifier(identifier: FixSourceMark(fileID: fileID, file: file, line: line, type: Content.self)))
    }

    /// Chart content and anything else that is not a view goes through as is.
    @_disfavoredOverload
    public static func buildExpression<Other>(_ other: Other) -> Other { other }
}

/// What Xcode Previews' selection reads: every UIHostingController has it, whatever its root view.
@MainActor
private protocol FixIdentifiedViews {
    func _forEachIdentifiedView(body: (_IdentifiedViewProxy) -> Void)
}

extension UIHostingController: FixIdentifiedViews {}

extension FixLocator {
    /// The SwiftUI view under the point in the app's window, or nil when no hosting controller draws
    /// there.
    static func element(at point: CGPoint, in window: UIWindow, fixable: FixElement?) -> FixElement? {
        guard let host = host(at: point, in: window) else { return nil }
        var clips: [CGRect] = []
        collectScrollFrames(in: host.view, window: window, into: &clips)
        return element(at: point, among: marks(of: host, in: window), clips: clips, fixable: fixable)
    }

    /// The hosting controller under the point: the first view controller up from the view the
    /// window's hit test finds, when it hosts SwiftUI; UIKit content such as a navigation bar has
    /// none. When the hit test finds nothing, the topmost hosting controller whose view holds the point.
    private static func host(at point: CGPoint, in window: UIWindow) -> (UIViewController & FixIdentifiedViews)? {
        if let hit = window.hitTest(point, with: nil), hit !== window {
            return FixInspector.responders(from: hit).first { $0 is UIViewController }
                as? UIViewController & FixIdentifiedViews
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
                    fileID: mark.fileID.description, source: FixSource(file: mark.file.description, line: mark.line),
                    type: mark.type, frame: host.view.convert(proxy.boundingRect, to: window)))
        }
        return marks
    }

    /// The visible region of every scroll view shown inside the view, in the window.
    private static func collectScrollFrames(in view: UIView, window: UIWindow, into frames: inout [CGRect]) {
        guard view.isVisible else { return }
        if view is UIScrollView {
            frames.append(view.frame(in: window))
        }
        for subview in view.subviews {
            collectScrollFrames(in: subview, window: window, into: &frames)
        }
    }
}
#else
extension FixLocator {
    /// Built without the SourceLocations trait, SwiftUI views carry no marks.
    static func element(at point: CGPoint, in window: UIWindow, fixable: FixElement?) -> FixElement? {
        nil
    }
}
#endif
#endif
