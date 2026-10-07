#if DEBUG
import UIKit

/// Names an unmarked UIKit view from the app's own objects: the property that holds it, the view
/// controller it belongs to, and its class and text. In a SwiftUI app none of the objects under a
/// press are the app's own, so it finds nothing and reports rely on accessibility alone.
@MainActor
enum FixInspector {
    struct Finding {
        /// The view under the press, named `Owner.property`, when a property holds it.
        var element: FixElement?
        /// The class of the app's view controller the view belongs to.
        var screen: String?
        /// The view's class and text, such as `UILabel "Alex Morgan"`.
        var view: String?
    }

    static func inspect(at point: CGPoint, in window: UIWindow) -> Finding {
        // hitTest looks past containers that let touches through, like a tab bar's over the content;
        // below the view it finds, labels and images that take no touches are searched for by hand.
        guard let hit = window.hitTest(point, with: nil),
              let deepest = deepestView(at: point, in: hit),
              let controller = responders(from: deepest).first(where: { $0 is UIViewController && isAppDefined($0) })
        else { return Finding() }

        let screen = String(describing: type(of: controller))
        for view in sequence(first: deepest, next: \.superview) {
            if let name = name(of: view) {
                let frame = view.convert(view.bounds, to: window)
                return Finding(
                    element: FixElement(name: name, file: nil, line: nil, frame: frame),
                    screen: screen, view: describe(view))
            }
            // Above a view controller's root view the views belong to someone else's screen.
            if view.next is UIViewController { break }
        }
        // A press on a control's own parts, a button's label or a switch's knob, describes the control.
        let control = sequence(first: deepest, next: \.superview).first { $0 is UIControl }
        return Finding(screen: screen, view: describe(control ?? deepest))
    }

    /// The deepest visible view under the point, whether or not it takes touches: `hitTest` alone
    /// would pass over labels and image views, exactly the views people point at.
    private static func deepestView(at point: CGPoint, in view: UIView) -> UIView? {
        guard !view.isHidden, view.alpha > 0.01, view.bounds.contains(view.convert(point, from: view.window))
        else { return nil }
        for subview in view.subviews.reversed() {
            if let deeper = deepestView(at: point, in: subview) { return deeper }
        }
        return view
    }

    private static func responders(from view: UIView) -> some Sequence<UIResponder> {
        sequence(first: view as UIResponder, next: \.next)
    }

    /// `Owner.property` for the first of the app's own objects around the view that holds it.
    private static func name(of view: UIView) -> String? {
        for owner in responders(from: view).dropFirst() where isAppDefined(owner) {
            if let property = property(of: owner, holding: view) {
                return "\(type(of: owner)).\(property)"
            }
        }
        return nil
    }

    /// The stored property of the object, or of its superclasses, that holds the view.
    private static func property(of owner: AnyObject, holding view: UIView) -> String? {
        var mirror: Mirror? = Mirror(reflecting: owner)
        while let current = mirror {
            for child in current.children {
                guard let label = child.label else { continue }
                // Optionals and weak references match through what they wrap.
                if let held = child.value as? UIView, held === view {
                    return propertyName(label)
                }
                // Only arrays of views are searched: an array of models costs nothing.
                if let views = child.value as? [UIView], let index = views.firstIndex(where: { $0 === view }) {
                    return "\(propertyName(label))[\(index)]"
                }
            }
            mirror = current.superclassMirror
        }
        return nil
    }

    /// The property's name as declared: a `lazy var` and a property wrapper store under other names.
    private static func propertyName(_ label: String) -> String {
        let lazyPrefix = "$__lazy_storage_$_"
        if label.hasPrefix(lazyPrefix) { return String(label.dropFirst(lazyPrefix.count)) }
        if label.hasPrefix("_") { return String(label.dropFirst()) }
        return label
    }

    private static func describe(_ view: UIView) -> String {
        let text: String? = switch view {
        case let label as UILabel: label.text
        case let button as UIButton: button.configuration?.title ?? button.currentTitle
        case let field as UITextField: field.text.flatMap { $0.isEmpty ? nil : $0 } ?? field.placeholder
        default: nil
        }
        let kind = String(describing: type(of: view))
        // An icon button or an image has no text of its own, only what it says to VoiceOver.
        guard let text = text.flatMap({ $0.isEmpty ? nil : $0 }) ?? view.accessibilityLabel, !text.isEmpty
        else { return kind }
        return "\(kind) \(String(reflecting: text))"
    }

    /// The app's own classes: UIKit's and SwiftUI's come from the system and say nothing about
    /// where the screen's code is.
    private static func isAppDefined(_ object: AnyObject) -> Bool {
        !Bundle(for: type(of: object)).bundlePath.contains("/System/Library/")
    }
}
#endif
