#if DEBUG
import SwiftUI
import UIKit.UIGestureRecognizerSubclass

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
    func body(content: Content) -> some View {
        content.task {
            if let window = FixHost.keyWindow {
                FixHost.shared.install(on: window)
            }
        }
    }
}

/// A long press held still for half a second. Not a `UILongPressGestureRecognizer`: UIKit keeps
/// those waiting for a context menu's press to fail, and it never fails while the menu opens.
@MainActor
final class FixPressRecognizer: UIGestureRecognizer {
    static let duration: TimeInterval = 0.5
    private static let allowableMovement: CGFloat = 10

    /// The held finger, for the app's gestures it also drives.
    private(set) weak var touch: UITouch?
    private var start = CGPoint.zero
    private var timer: Timer?

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        guard event.allTouches?.count == 1, let touch = touches.first else {
            state = .failed
            return
        }
        self.touch = touch
        start = touch.location(in: nil)
        // The common modes keep it running while a scroll view tracks the touch.
        let timer = Timer(timeInterval: Self.duration, target: self, selector: #selector(held), userInfo: nil, repeats: false)
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        let point = location(in: nil)
        if hypot(point.x - start.x, point.y - start.y) > Self.allowableMovement {
            state = .failed
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        state = .failed
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        state = .failed
    }

    override func reset() {
        super.reset()
        timer?.invalidate()
        timer = nil
        touch = nil
    }

    @objc private func held() {
        // A failed press keeps its timer until UIKit resets it.
        if state == .possible { state = .recognized }
    }
}

/// A long press anywhere in the window, recognised alongside the app's own gestures.
@MainActor
final class FixGesture: NSObject, UIGestureRecognizerDelegate {
    static let shared = FixGesture()

    func install(on window: UIWindow) {
        let recognizer = FixPressRecognizer(target: self, action: #selector(pressed))
        recognizer.delegate = self
        window.addGestureRecognizer(recognizer)
    }

    @objc private func pressed(_ recognizer: FixPressRecognizer) {
        guard let window = recognizer.view as? UIWindow,
              FixSession.shared.target == nil, !FixSession.shared.isSending
        else { return }

        // The press is ours now: the button or scroll view under the finger must not also act on it.
        // The window's own recognizers are the system's touch gates and are left alone.
        for other in recognizer.touch?.gestureRecognizers ?? [] where other.view !== window && other.isEnabled {
            other.isEnabled = false
            other.isEnabled = true
        }

        report(at: recognizer.location(in: window), in: window)
    }

    /// Opens the composer for the element at the point, as a long press there does.
    func report(at point: CGPoint, in window: UIWindow? = nil) {
        guard let window = window ?? FixHost.shared.appWindow else { return }
        let finding = FixInspector.inspect(at: point, in: window)
        // Inside SwiftUI each view's mark says where it is written, a UIKit view is found along the
        // view hierarchy, and of the two the inner one wins; without either, a SwiftUI .fixable by its frame.
        let located = FixLocator.element(at: point, in: window)
        let element = FixLocator.inner(located, finding.element) ?? FixRegistry.shared.element(at: point)
        // The marks name the view and its line, so accessibility's description of a view is left out.
        let markedViewWon = located != nil && element == located
        let named = FixRegistry.shared.screen
        FixSession.shared.begin(
            FixTarget(
                element: element, touch: point, screen: named.isEmpty ? finding.screen ?? "" : named,
                viewDescription: markedViewWon ? nil : finding.viewDescription,
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

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
#endif
