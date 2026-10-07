import Testing
import UIKit
@testable import FixKit

/// A container that hands the status bar's visibility, but not its style, to a child.
private final class ContainerViewController: UIViewController {
    let child = UIViewController()

    override var childForStatusBarHidden: UIViewController? { child }
}

@MainActor
struct FixOverlayTests {
    @Test func statusBarStyleAndVisibilityFollowTheirOwnChildren() {
        let container = ContainerViewController()

        #expect(FixOverlayController.statusBarController(from: container, child: \UIViewController.childForStatusBarHidden) === container.child)
        #expect(FixOverlayController.statusBarController(from: container, child: \UIViewController.childForStatusBarStyle) === container)
    }
}
