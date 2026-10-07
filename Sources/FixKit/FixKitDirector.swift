#if DEBUG
import SwiftUI

/// Plays scripted reports for screen recordings: a press on a named element, the comment typed
/// letter by letter, the send button. Off unless the app's defaults hold `FixKitDirector = YES`:
/// then at launch it asks a director on 127.0.0.1:4748 for steps, and when nothing answers there
/// it stays idle until the next launch.
@MainActor
final class FixDirector {
    static let shared = FixDirector()
    static let switchKey = "FixKitDirector"

    private struct Step: Decodable {
        /// The `.fixable` name of the element to press, or the point to press in window coordinates.
        var press: String?
        var at: CGPoint?
        var text: String?
        var scroll: CGFloat?
        /// Values to store in the app's defaults, for the director to relaunch the app with:
        /// the tab it opens on, say.
        var defaults: [String: String]?
    }

    private var isRunning = false

    func start() {
        guard !isRunning else { return }
        isRunning = true

        Task {
            let next = URL(string: "http://127.0.0.1:4748/next")!
            while let (data, response) = try? await URLSession.shared.data(from: next) {
                guard (response as? HTTPURLResponse)?.statusCode == 200,
                      let step = try? JSONDecoder().decode(Step.self, from: data)
                else { continue }
                await play(step)
            }
        }
    }

    private func play(_ step: Step) async {
        if let distance = step.scroll {
            scroll(by: distance)
            return
        }
        if let values = step.defaults {
            for (key, value) in values {
                UserDefaults.standard.set(value, forKey: key)
            }
            return
        }
        let element = step.press.flatMap { FixRegistry.shared.element(named: $0) }
        guard let point = step.at ?? element.map({ CGPoint(x: $0.frame.midX, y: $0.frame.midY) }) else { return }
        let session = FixSession.shared

        // As long as a finger would rest before the long press fires.
        try? await Task.sleep(for: .seconds(0.6))
        FixGesture.shared.report(at: point)

        try? await Task.sleep(for: .seconds(0.9))
        for character in step.text ?? "" {
            session.draft.append(character)
            try? await Task.sleep(for: .milliseconds(.random(in: 55...125)))
        }

        try? await Task.sleep(for: .seconds(0.8))
        session.send(comment: session.draft)
        // The next step waits until the receiver has read the screen this one left.
        while session.isSending {
            try? await Task.sleep(for: .milliseconds(100))
        }
    }

    private func scroll(by distance: CGFloat) {
        guard let window = FixHost.shared.appWindow, let scrollView = scrollView(in: window) else { return }
        let bottom = scrollView.contentSize.height + scrollView.adjustedContentInset.bottom - scrollView.bounds.height
        let y = min(max(bottom, 0), scrollView.contentOffset.y + distance)
        scrollView.setContentOffset(CGPoint(x: scrollView.contentOffset.x, y: y), animated: true)
    }

    private func scrollView(in view: UIView) -> UIScrollView? {
        if let scrollView = view as? UIScrollView, scrollView.contentSize.height > scrollView.bounds.height {
            return scrollView
        }
        return view.subviews.lazy.compactMap { self.scrollView(in: $0) }.first
    }
}
#endif
