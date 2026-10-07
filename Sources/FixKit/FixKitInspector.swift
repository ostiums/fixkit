#if DEBUG
import UIKit

/// Names the UIKit view under a press from the app's own objects: a `.fixable` mark on it or on a
/// view around it, else the property that holds it, the view controller it belongs to, and its
/// class and text. In a SwiftUI app none of the objects under a press are the app's own, so it
/// finds nothing and reports rely on SwiftUI marks and accessibility.
@MainActor
enum FixInspector {
    struct Finding {
        /// The view under the press or the nearest one around it that is marked or held by a property.
        var element: FixElement?
        /// The class of the app's view controller the view belongs to.
        var screen: String?
        /// The view's class and text, such as `UILabel "Alex Morgan"`.
        var viewDescription: String?
    }

    static func inspect(at point: CGPoint, in window: UIWindow) -> Finding {
        // hitTest looks past containers that let touches through, like a tab bar's over the content;
        // below the view it finds, labels and images that take no touches are searched for by hand.
        guard let hit = window.hitTest(point, with: nil),
              let pressed = deepestView(at: hit.convert(point, from: window), in: hit)
        else { return Finding() }

        let controller = responders(from: pressed).first { $0 is UIViewController && isAppDefined($0) }
        var finding = Finding(screen: controller.map { String(describing: type(of: $0)) })
        let names = propertyNames(around: pressed)

        // The nearest view that is marked or held by a property wins: a label inside a marked card
        // names the label. Only views on the path of the press count, so nothing under a sheet does.
        for view in pressed.ancestors where !(view is UIWindow) {
            let named = names[ObjectIdentifier(view)].map { FixElement(name: $0, source: nil, frame: view.frame(in: window)) }
            if let element = FixRegistry.shared.mark(on: view) ?? named {
                finding.element = element
                finding.viewDescription = describe(view)
                return finding
            }
        }
        if finding.screen != nil {
            finding.viewDescription = describe(pressed)
        }
        return finding
    }

    /// The deepest visible view under the point, in the view's own coordinates, whether or not it
    /// takes touches: `hitTest` alone would pass over labels and image views. A control is as deep
    /// as it goes: its label or knob is the control.
    private static func deepestView(at point: CGPoint, in view: UIView) -> UIView? {
        guard view.isVisible, view.bounds.contains(point) else { return nil }
        guard !(view is UIControl) else { return view }
        for subview in view.subviews.reversed() {
            if let deeper = deepestView(at: subview.convert(point, from: view), in: subview) { return deeper }
        }
        return view
    }

    /// The responder chain below the window: views, their view controllers, and their parents.
    private static func responders(from view: UIView) -> some Sequence<UIResponder> {
        sequence(first: view as UIResponder, next: \.next).prefix { !($0 is UIWindow) }
    }

    /// `Owner.property` for every view held by the app's own objects around the pressed view; a view
    /// held by several is named after the nearest.
    private static func propertyNames(around view: UIView) -> [ObjectIdentifier: String] {
        var names: [ObjectIdentifier: String] = [:]
        for owner in responders(from: view) where isAppDefined(owner) {
            for (held, property) in views(heldBy: owner) where names[ObjectIdentifier(held)] == nil {
                names[ObjectIdentifier(held)] = "\(type(of: owner)).\(property)"
            }
        }
        return names
    }

    /// The views the object's stored properties hold, its superclasses' included, with the
    /// properties' names. Optionals and weak references count through what they wrap.
    private static func views(heldBy owner: AnyObject) -> [(UIView, String)] {
        var held: [(UIView, String)] = []
        var mirror: Mirror? = Mirror(reflecting: owner)
        while let current = mirror {
            for child in current.children {
                guard let label = child.label else { continue }
                let name = propertyName(label)
                if let view = child.value as? UIView {
                    held.append((view, name))
                } else if let views = child.value as? [UIView] {
                    held += views.enumerated().map { ($1, "\(name)[\($0)]") }
                }
            }
            mirror = current.superclassMirror
        }
        return held
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
        case let field as UITextField: field.text.nonEmpty ?? field.placeholder
        default: nil
        }
        let kind = String(describing: type(of: view))
        // An icon button or an image has no text of its own, only what it says to VoiceOver.
        guard let text = text.nonEmpty ?? view.accessibilityLabel.nonEmpty else { return kind }
        return "\(kind) \(String(reflecting: text))"
    }

    /// The app's own classes: UIKit's and SwiftUI's come from the system and say nothing about
    /// where the screen's code is.
    private static func isAppDefined(_ object: AnyObject) -> Bool {
        !Bundle(for: type(of: object)).bundlePath.contains("/System/Library/")
    }
}

private extension Optional<String> {
    var nonEmpty: String? {
        flatMap { $0.isEmpty ? nil : $0 }
    }
}
#endif
