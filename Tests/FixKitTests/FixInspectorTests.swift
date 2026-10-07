import SwiftUI
import Testing
import UIKit
@testable import FixKit

private final class ProfileHeaderView: UIView {
    let titleLabel = UILabel(frame: CGRect(x: 10, y: 10, width: 200, height: 30))

    override init(frame: CGRect) {
        super.init(frame: frame)
        titleLabel.text = "Profile"
        addSubview(titleLabel)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }
}

/// Like a tab bar's container above the content: full screen, transparent, and passing touches through.
private final class PassthroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}

private final class ProfileViewController: UIViewController {
    let header = ProfileHeaderView(frame: CGRect(x: 0, y: 0, width: 400, height: 100))
    let nameLabel = UILabel(frame: CGRect(x: 20, y: 120, width: 200, height: 30))
    lazy var payButton = UIButton(frame: CGRect(x: 20, y: 160, width: 120, height: 44))
    weak var outlet: UILabel?
    var buttons = [
        UIButton(frame: CGRect(x: 20, y: 300, width: 80, height: 44)),
        UIButton(frame: CGRect(x: 120, y: 300, width: 80, height: 44)),
    ]

    override func viewDidLoad() {
        super.viewDidLoad()
        view.addSubview(header)

        nameLabel.text = "Alex Morgan"
        view.addSubview(nameLabel)

        payButton.setTitle("Pay", for: .normal)
        view.addSubview(payButton)

        let outletLabel = UILabel(frame: CGRect(x: 20, y: 220, width: 200, height: 30))
        outletLabel.text = "Balance"
        view.addSubview(outletLabel)
        outlet = outletLabel

        buttons.forEach(view.addSubview)

        let local = UILabel(frame: CGRect(x: 20, y: 400, width: 200, height: 30))
        local.text = "Local"
        view.addSubview(local)
    }
}

@MainActor
struct FixInspectorTests {
    private let controller = ProfileViewController()
    private let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))

    init() {
        window.rootViewController = controller
        window.isHidden = false
        controller.view.frame = window.bounds
        window.layoutIfNeeded()
    }

    private func inspect(_ x: CGFloat, _ y: CGFloat) -> FixInspector.Finding {
        FixInspector.inspect(at: CGPoint(x: x, y: y), in: window)
    }

    @Test func namesAControllerProperty() {
        let finding = inspect(40, 130)
        #expect(finding.element?.name == "ProfileViewController.nameLabel")
        #expect(finding.element?.frame == CGRect(x: 20, y: 120, width: 200, height: 30))
        #expect(finding.element?.source == nil)
        #expect(finding.screen == "ProfileViewController")
        #expect(finding.viewDescription == #"UILabel "Alex Morgan""#)
    }

    @Test func namesACustomViewProperty() {
        #expect(inspect(30, 20).element?.name == "ProfileHeaderView.titleLabel")
    }

    @Test func namesALazyProperty() {
        #expect(inspect(40, 180).element?.name == "ProfileViewController.payButton")
    }

    @Test func aPressOnAButtonsOwnSubviewNamesTheButton() throws {
        controller.payButton.layoutIfNeeded()
        let title = try #require(controller.payButton.titleLabel)
        let point = title.convert(CGPoint(x: title.bounds.midX, y: title.bounds.midY), to: window)
        #expect(inspect(point.x, point.y).element?.name == "ProfileViewController.payButton")
        #expect(inspect(point.x, point.y).viewDescription == #"UIButton "Pay""#)
    }

    @Test func namesAWeakOutlet() {
        #expect(inspect(40, 230).element?.name == "ProfileViewController.outlet")
    }

    @Test func namesAnElementOfAViewArray() {
        #expect(inspect(140, 310).element?.name == "ProfileViewController.buttons[1]")
    }

    @Test func anUnnamedViewStillGivesTheScreenAndItsText() {
        let finding = inspect(40, 410)
        #expect(finding.element == nil)
        #expect(finding.screen == "ProfileViewController")
        #expect(finding.viewDescription == #"UILabel "Local""#)
    }

    @Test func hiddenViewsAreSkipped() {
        controller.nameLabel.isHidden = true
        let finding = inspect(40, 130)
        #expect(finding.element?.name != "ProfileViewController.nameLabel")
        #expect(finding.viewDescription != #"UILabel "Alex Morgan""#)
    }

    @Test func aContainerThatPassesTouchesThroughIsLookedPast() {
        window.addSubview(PassthroughView(frame: window.bounds))
        #expect(inspect(40, 130).element?.name == "ProfileViewController.nameLabel")
    }

    @Test func aButtonBuiltFromAConfigurationIsDescribedByItsTitle() {
        let button = UIButton(configuration: .filled())
        button.configuration?.title = "Top up"
        button.frame = CGRect(x: 220, y: 400, width: 120, height: 44)
        controller.view.addSubview(button)
        window.layoutIfNeeded()

        #expect(inspect(280, 420).viewDescription == #"UIButton "Top up""#)
    }

    @Test func aViewWithoutTextIsDescribedByItsAccessibilityLabel() {
        let close = UIButton(frame: CGRect(x: 300, y: 500, width: 44, height: 44))
        close.setImage(UIImage(systemName: "xmark"), for: .normal)
        close.accessibilityLabel = "Close"
        controller.view.addSubview(close)

        #expect(inspect(320, 520).viewDescription == #"UIButton "Close""#)
    }

    @Test func aMarkWinsOverTheProperty() {
        controller.nameLabel.fixable("profile.name")
        let element = inspect(40, 130).element
        #expect(element?.name == "profile.name")
        #expect(element?.source?.file.hasSuffix("FixInspectorTests.swift") == true)
    }

    @Test func theNearestOfAMarkAndAPropertyWins() {
        controller.header.fixable("profile.header")
        #expect(inspect(30, 20).element?.name == "ProfileHeaderView.titleLabel")
        #expect(inspect(300, 70).element?.name == "profile.header")
    }

    @Test func aMarkUnderASheetDoesNotWin() {
        controller.nameLabel.fixable("profile.name")
        window.addSubview(UIView(frame: CGRect(x: 0, y: 100, width: 400, height: 700)))
        #expect(inspect(40, 130).element == nil)
    }

    @Test func aSwiftUIScreenGivesNothing() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        window.rootViewController = UIHostingController(rootView: Text("Home"))
        window.isHidden = false
        window.layoutIfNeeded()

        let finding = FixInspector.inspect(at: CGPoint(x: 200, y: 400), in: window)
        #expect(finding.element == nil)
        #expect(finding.screen == nil)
        #expect(finding.viewDescription == nil)
    }
}
