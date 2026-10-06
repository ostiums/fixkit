#if DEBUG
import SwiftUI

@MainActor
@Observable
final class FixSession {
    static let shared = FixSession()

    var target: FixTarget?
    var banner: Banner?
    /// How far the app is slid up so the keyboard does not cover the pressed element.
    var lift: CGFloat = 0
    /// The comment being typed in the composer.
    var draft = ""
    /// A report is on its way: the receiver answers once it has read the screen, and until then
    /// a new long press would change the screen it reads.
    private(set) var isSending = false

    struct Banner: Equatable {
        var text: String
        var symbol: String
        var isWorking = false
    }

    private var polling: Task<Void, Never>?
    private var hiding: Task<Void, Never>?
    @ObservationIgnored private var isKeyboardShown = false

    private init() {
        let center = NotificationCenter.default
        center.addObserver(forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { FixSession.shared.isKeyboardShown = true }
        }
        center.addObserver(forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { FixSession.shared.isKeyboardShown = false }
        }
    }

    func begin(_ target: FixTarget) {
        draft = ""
        withAnimation(.snappy(duration: 0.25)) { self.target = target }
    }

    func cancel() {
        close()
    }

    private func close(then settled: @escaping () -> Void = {}) {
        withAnimation(.snappy(duration: 0.2)) {
            target = nil
            lift = 0
        } completion: {
            settled()
        }
    }

    func send(comment: String) {
        guard let target, !comment.isEmpty else { return }

        polling?.cancel()
        isSending = true
        polling = Task {
            // The receiver reads the screen's accessibility tree as the report arrives, so the
            // report leaves once the composer and the keyboard are gone and the screen is back
            // to what was pressed.
            await dismiss()
            do {
                let id = try await FixKitClient.send(target, comment: comment)
                isSending = false
                show(Banner(text: "Sent to Claude Code", symbol: "paperplane.fill", isWorking: true))
                await follow(id)
            } catch {
                isSending = false
                show(Banner(text: "Claude Code is not listening", symbol: "wifi.slash"), for: 4)
            }
        }
    }

    private func dismiss() async {
        let hadKeyboard = isKeyboardShown
        await withCheckedContinuation { done in close { done.resume() } }
        // The keyboard slides away on its own clock, a little after the composer.
        let deadline = ContinuousClock.now + .seconds(1)
        while hadKeyboard, isKeyboardShown, ContinuousClock.now < deadline {
            try? await Task.sleep(for: .milliseconds(50))
        }
    }

    /// At launch: tells the receiver the app is up, which is how the mod learns that a fix is on
    /// screen however the app was built. Then follows the report Claude is working on, or says
    /// so once when the build on screen is the one that just went live.
    func announceLaunch() async {
        guard let latest = try? await FixKitClient.launched(), let id = latest.id, let status = latest.status
        else { return }

        switch status {
        case "live": announceFixed(latest)
        case "stopped": break
        default: polling = Task { await follow(id) }
        }
    }

    private func announceFixed(_ fix: FixStatus) {
        let key = "\(fix.run)/\(fix.id ?? "")"
        guard UserDefaults.standard.string(forKey: "fixkit.announced") != key else { return }
        UserDefaults.standard.set(key, forKey: "fixkit.announced")
        show(Banner(text: "Fixed by Claude Code", symbol: "checkmark.circle.fill"), for: 4)
    }

    private func follow(_ id: String) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            guard let latest = try? await FixKitClient.status(of: id), let status = latest.status else { continue }

            switch status {
            case "fixing":
                show(Banner(text: "Claude is fixing it", symbol: "wand.and.stars", isWorking: true))
            case "rebuilding":
                show(Banner(text: "Rebuilding the app", symbol: "hammer.fill", isWorking: true))
            case "live":
                announceFixed(latest)
                return
            case "stopped":
                show(Banner(text: "Not rebuilt: see Claude Code", symbol: "xmark.circle.fill"), for: 4)
                return
            default:
                show(Banner(text: "Queued in Claude Code", symbol: "tray.full.fill", isWorking: true))
            }
        }
    }

    private func show(_ banner: Banner, for seconds: Double? = nil) {
        hiding?.cancel()
        withAnimation(.snappy) { self.banner = banner }

        guard let seconds else { return }
        hiding = Task {
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            withAnimation(.snappy) { self.banner = nil }
        }
    }
}

struct FixKitHostModifier: ViewModifier {
    @State private var session = FixSession.shared

    func body(content: Content) -> some View {
        content
            .offset(y: -session.lift)
            .overlay {
                if let target = session.target {
                    FixComposerOverlay(target: target, session: session)
                        .transition(.opacity)
                }
            }
            .overlay(alignment: .top) {
                if let banner = session.banner {
                    FixBanner(banner: banner)
                        .padding(.top, 6)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier(fixKitIdentifier("banner"))
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .task {
                FixGesture.shared.install()
                if UserDefaults.standard.bool(forKey: FixDirector.switchKey) {
                    FixDirector.shared.start()
                }
                await session.announceLaunch()
            }
    }
}

/// A long press anywhere in the window, recognised alongside the app's own gestures.
@MainActor
final class FixGesture: NSObject, UIGestureRecognizerDelegate {
    static let shared = FixGesture()

    private var recognizer: UILongPressGestureRecognizer?
    private var competing: [UIGestureRecognizer] = []

    func install() {
        guard recognizer == nil, let window = keyWindow else { return }

        let recognizer = UILongPressGestureRecognizer(target: self, action: #selector(pressed))
        recognizer.minimumPressDuration = 0.5
        recognizer.delegate = self
        window.addGestureRecognizer(recognizer)
        self.recognizer = recognizer
    }

    var keyWindow: UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        return windows.first(where: \.isKeyWindow) ?? windows.first
    }

    @objc private func pressed(_ recognizer: UILongPressGestureRecognizer) {
        guard recognizer.state == .began, let window = recognizer.view as? UIWindow,
              FixSession.shared.target == nil, !FixSession.shared.isSending
        else { return }

        // The press is ours now: the button or scroll view under the finger must not also act on it.
        // The window's own recognizers are the system's touch gates and are left alone.
        for other in competing where other.view !== window && other.isEnabled {
            other.isEnabled = false
            other.isEnabled = true
        }

        report(at: recognizer.location(in: window), in: window)
    }

    /// Opens the composer for the element at the point, as a long press there does.
    func report(at point: CGPoint, in window: UIWindow? = nil) {
        guard let window = window ?? keyWindow else { return }
        let element = FixRegistry.shared.element(at: point)
        FixSession.shared.begin(
            FixTarget(
                element: element, touch: point, screen: FixRegistry.shared.screen,
                screenshot: screenshot(of: window, marking: element?.frame, touch: point)))
    }

    /// The window as it looks now, with the reported element outlined in red, or a red ring
    /// where the finger was when no marked element is under it.
    private func screenshot(of window: UIWindow, marking frame: CGRect?, touch: CGPoint) -> Data? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1

        return UIGraphicsImageRenderer(bounds: window.bounds, format: format).pngData { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)

            UIColor.systemRed.setStroke()
            let outline = frame.map { UIBezierPath(roundedRect: $0.insetBy(dx: -4, dy: -4), cornerRadius: 8) }
                ?? UIBezierPath(ovalIn: CGRect(x: touch.x - 22, y: touch.y - 22, width: 44, height: 44))
            outline.lineWidth = 2
            outline.stroke()
        }
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        competing = touch.gestureRecognizers ?? []
        return true
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
#endif
