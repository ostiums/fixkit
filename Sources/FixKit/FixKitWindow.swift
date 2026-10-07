#if DEBUG
import SwiftUI

/// FixKit on the app's window: the long press on it, a window above it that draws the composer and
/// the banners, and the launch signal. SwiftUI's `.fixKitHost()` and UIKit's `window.fixKitHost()`
/// both install it.
@MainActor
final class FixHost {
    static let shared = FixHost()

    private(set) weak var appWindow: UIWindow?
    private var overlay: FixOverlayWindow?

    /// The app's key window, never FixKit's own.
    static var keyWindow: UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .filter { !($0 is FixOverlayWindow) }
        return windows.first(where: \.isKeyWindow) ?? windows.first
    }

    func install(on window: UIWindow) {
        guard appWindow == nil, let scene = window.windowScene else { return }
        appWindow = window
        FixGesture.shared.install(on: window)

        let overlay = FixOverlayWindow(windowScene: scene)
        overlay.rootViewController = FixOverlayController(rootView: FixOverlay(session: .shared, host: self))
        overlay.isHidden = false
        self.overlay = overlay

        if UserDefaults.standard.bool(forKey: FixDirector.switchKey) {
            FixDirector.shared.start()
        }
        Task { await FixSession.shared.announceLaunch() }
    }

    /// The composer's text field needs the keyboard while it is open; the app gets it back after.
    func composerChanged(isOpen: Bool) {
        if isOpen {
            overlay?.makeKey()
        } else {
            appWindow?.makeKey()
        }
    }

    /// Slides the app up so the keyboard does not cover the pressed element.
    func lift(to height: CGFloat) {
        guard let appWindow else { return }
        UIView.animate(withDuration: 0.3, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0) {
            appWindow.transform = CGAffineTransform(translationX: 0, y: -height)
        }
    }
}

/// Sits above the app's window and lets every touch through to it unless the composer is open.
final class FixOverlayWindow: UIWindow {
    override init(windowScene: UIWindowScene) {
        super.init(windowScene: windowScene)
        // Above the app and its alerts, below the keyboard.
        windowLevel = .alert + 1
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        FixSession.shared.target == nil ? nil : super.hitTest(point, with: event)
    }
}

/// Hosts the overlay and leaves the status bar to the app's own view controllers.
final class FixOverlayController: UIHostingController<FixOverlay> {
    override init(rootView: FixOverlay) {
        super.init(rootView: rootView)
        view.backgroundColor = .clear
    }

    @MainActor required dynamic init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        appStatusBarController?.preferredStatusBarStyle ?? .default
    }

    override var prefersStatusBarHidden: Bool {
        appStatusBarController?.prefersStatusBarHidden ?? false
    }

    /// The app's view controller that decides its status bar.
    private var appStatusBarController: UIViewController? {
        var controller = FixHost.shared.appWindow?.rootViewController
        while let next = controller?.presentedViewController ?? controller?.childForStatusBarStyle {
            controller = next
        }
        return controller
    }
}

/// The composer while a report is being written, and the banners.
struct FixOverlay: View {
    let session: FixSession
    let host: FixHost

    var body: some View {
        ZStack {
            if let target = session.target {
                FixComposerOverlay(target: target, session: session)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .top) {
            if let banner = session.banner {
                FixBanner(banner: banner)
                    .padding(.top, 6)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier(fixKitIdentifier("banner"))
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .onChange(of: session.target != nil) { _, isOpen in host.composerChanged(isOpen: isOpen) }
        .onChange(of: session.lift) { _, lift in host.lift(to: lift) }
    }
}
#endif
