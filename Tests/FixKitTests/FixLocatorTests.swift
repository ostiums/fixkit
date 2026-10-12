import SwiftUI
import Testing
@testable import FixKit

private struct Row: View {
    var body: some View { Text("Coffee") }
}

/// A shape the app declares, as cards draw their background with.
private struct CardShape: Shape {
    func path(in rect: CGRect) -> Path { Path(rect) }
}

/// A modifier the app declares: its body builds `content` with its own mark.
private struct AmountStyle: ViewModifier {
    func body(content: Content) -> some View { content.bold() }
}

private struct Screen: View {
    var body: some View { Row() }
}

@MainActor
struct FixLocatorTests {
    private func mark(_ type: Any.Type, _ line: Int, _ frame: CGRect, fileID: String = "FixKitTests/Screen.swift") -> FixMark {
        FixMark(fileID: fileID, source: FixSource(file: "/App/\(fileID)", line: line), type: type, frame: frame)
    }

    private func source(_ line: Int) -> FixSource {
        FixSource(file: "/App/FixKitTests/Screen.swift", line: line)
    }

    /// A screen with one row, in the order SwiftUI paints them: each view before the views inside it.
    private var screen: [FixMark] {
        [
            mark(Screen.self, 1, CGRect(x: 0, y: 0, width: 400, height: 800)),
            mark(VStack<Row>.self, 10, CGRect(x: 0, y: 0, width: 400, height: 800)),
            mark(ModifiedContent<Row, _PaddingLayout>.self, 12, CGRect(x: 0, y: 100, width: 400, height: 60)),
            mark(HStack<Text>.self, 20, CGRect(x: 0, y: 100, width: 400, height: 60)),
            mark(Text.self, 21, CGRect(x: 20, y: 110, width: 100, height: 20)),
        ]
    }

    @Test func theInnermostViewNamesItsComponentAndWhereItIsUsed() {
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen, clips: [], fixable: nil)

        #expect(element?.name == "Row › Text")
        #expect(element?.source == source(21))
        #expect(element?.usedAt == [source(12), source(1)])
        #expect(element?.frame == CGRect(x: 20, y: 110, width: 100, height: 20))
    }

    @Test func ofEqualFramesTheLaterPaintedIsInner() {
        let element = FixLocator.element(at: CGPoint(x: 300, y: 130), among: screen, clips: [], fixable: nil)

        #expect(element?.name == "Row › HStack")
        #expect(element?.source == source(20))
        #expect(element?.usedAt.first == source(12))
    }

    @Test func aTransparentContainerDrawnOverTheContentDoesNotWin() {
        let overlay = mark(VStack<Spacer>.self, 30, CGRect(x: 0, y: 0, width: 400, height: 800))
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen + [overlay], clips: [], fixable: nil)

        #expect(element?.source == source(21))
    }

    @Test func decorationGivesWayToTheContent() {
        let circle = mark(_ShapeView<Circle, Color>.self, 15, CGRect(x: 25, y: 112, width: 10, height: 10))
        var marks = screen
        marks.insert(circle, at: 3)

        let onText = FixLocator.element(at: CGPoint(x: 30, y: 115), among: marks, clips: [], fixable: nil)
        #expect(onText?.source == source(21))

        // A colour filling the row behind it, painted after the row's HStack.
        let fill = mark(Color.self, 16, CGRect(x: 0, y: 100, width: 400, height: 60))
        let onFill = FixLocator.element(at: CGPoint(x: 300, y: 125), among: screen + [fill], clips: [], fixable: nil)
        #expect(onFill?.source == source(20))
    }

    @Test func onlyDecorationUnderThePointGivesTheInnermost() {
        let circle = mark(Circle.self, 15, CGRect(x: 0, y: 0, width: 50, height: 50))
        let element = FixLocator.element(at: CGPoint(x: 10, y: 10), among: [circle], clips: [], fixable: nil)

        #expect(element?.name == "Circle")
    }

    @Test func contentScrolledPastTheScrollViewsEdgeIsNotUnderTheBar() {
        let row = mark(HStack<Text>.self, 20, CGRect(x: 0, y: 680, width: 400, height: 60))
        let bar = mark(HStack<Text>.self, 40, CGRect(x: 0, y: 700, width: 400, height: 100))
        let element = FixLocator.element(
            at: CGPoint(x: 30, y: 720), among: [row, bar], clips: [CGRect(x: 0, y: 0, width: 400, height: 700)], fixable: nil)

        #expect(element?.source == source(40))
    }

    @Test func aFrameIsCutOnlyWhereItCrossesAScrollView() {
        let scroll = CGRect(x: 0, y: 0, width: 400, height: 700)

        #expect(FixLocator.clipped(CGRect(x: 0, y: 0, width: 400, height: 800), to: [scroll]) == CGRect(x: 0, y: 0, width: 400, height: 800))
        #expect(FixLocator.clipped(CGRect(x: 0, y: 720, width: 400, height: 60), to: [scroll]) == CGRect(x: 0, y: 720, width: 400, height: 60))
        #expect(FixLocator.clipped(CGRect(x: 0, y: 680, width: 400, height: 60), to: [scroll]) == CGRect(x: 0, y: 680, width: 400, height: 20))
    }

    @Test func fixKitsOwnViewsAreNeverChosen() {
        let own = mark(Text.self, 5, CGRect(x: 25, y: 112, width: 5, height: 5), fileID: "FixKit/FixKit.swift")
        let element = FixLocator.element(at: CGPoint(x: 27, y: 114), among: screen + [own], clips: [], fixable: nil)

        #expect(element?.source == source(21))
    }

    @Test func aFixableAroundTheComponentLendsItsName() {
        let fixable = FixElement(name: "row.coffee", source: nil, frame: CGRect(x: 0, y: 100, width: 400, height: 60))
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen, clips: [], fixable: fixable)

        #expect(element?.name == "row.coffee › Text")
        #expect(element?.source == source(21))
    }

    @Test func aFixableOutsideTheNearestComponentDoesNot() {
        let fixable = FixElement(name: "screen", source: nil, frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen, clips: [], fixable: fixable)

        #expect(element?.name == "Row › Text")
    }

    @Test func aRingDrawnAroundAnIconGivesWayToIt() {
        let icon = mark(Image.self, 50, CGRect(x: 60, y: 520, width: 40, height: 40))
        let ring = mark(StrokeBorderShapeView<Circle, Color, EmptyView>.self, 51, CGRect(x: 60, y: 520, width: 40, height: 40))
        let element = FixLocator.element(at: CGPoint(x: 80, y: 540), among: screen + [icon, ring], clips: [], fixable: nil)

        #expect(element?.source == source(50))
    }

    @Test func aViewDrawnOverPartOfAnotherCoversIt() {
        // A row's label scrolled under a tab button: the button is painted later and does not hold it.
        let label = mark(Text.self, 21, CGRect(x: 90, y: 806, width: 96, height: 14))
        let button = mark(VStack<Text>.self, 60, CGRect(x: 12, y: 778, width: 126, height: 62))
        let element = FixLocator.element(at: CGPoint(x: 100, y: 812), among: screen + [label, button], clips: [], fixable: nil)

        #expect(element?.source == source(60))
    }

    @Test func aContainerPaintedLaterIsNotAComponent() {
        let overlay = mark(Screen.self, 30, CGRect(x: 0, y: 0, width: 400, height: 800))
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen + [overlay], clips: [], fixable: nil)

        #expect(element?.usedAt == [source(12), source(1)])
    }

    @Test func aFixableBesideThePressedViewDoesNotLendItsName() {
        let fixable = FixElement(name: "tab.home", source: nil, frame: CGRect(x: 0, y: 100, width: 25, height: 60))
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen, clips: [], fixable: fixable)

        #expect(element?.name == "Row › Text")
    }

    @Test func anAppShapeBehindTheContentIsNoComponent() {
        var marks = screen
        marks.insert(mark(CardShape.self, 13, CGRect(x: 0, y: 100, width: 400, height: 60)), at: 3)
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: marks, clips: [], fixable: nil)

        #expect(element?.name == "Row › Text")
        #expect(element?.usedAt == [source(12), source(1)])
    }

    @Test func ofASwiftUIAndAUIKitFindingTheInnerOneWins() {
        let row = FixElement(name: "Row › HStack", source: source(20), frame: CGRect(x: 0, y: 100, width: 400, height: 60))
        let label = FixElement(name: "map.label", source: nil, frame: CGRect(x: 20, y: 110, width: 100, height: 20))
        let container = FixElement(name: "HostViewController.container", source: nil, frame: CGRect(x: 0, y: 0, width: 400, height: 800))

        #expect(FixLocator.inner(row, label) == label)
        #expect(FixLocator.inner(row, container) == row)
        #expect(FixLocator.inner(nil, container) == container)
        #expect(FixLocator.inner(row, nil) == row)
    }

    @Test func aShapeOfItsOwnCanBePressed() {
        let bar = mark(ModifiedContent<_ShapeView<Capsule, Color>, _FrameLayout>.self, 22, CGRect(x: 200, y: 140, width: 150, height: 6))
        let element = FixLocator.element(at: CGPoint(x: 250, y: 142), among: screen + [bar], clips: [], fixable: nil)

        #expect(element?.name == "Row › Capsule")
        #expect(element?.source == source(22))
    }

    @Test func aModifiersContentStandsForTheViewItModifies() {
        let amount = mark(ModifiedContent<Text, AmountStyle>.self, 70, CGRect(x: 300, y: 110, width: 60, height: 20))
        let styled = mark(
            ModifiedContent<_ViewModifier_Content<AmountStyle>, _EnvironmentKeyWritingModifier<Font.Weight?>>.self, 3,
            CGRect(x: 300, y: 110, width: 60, height: 20), fileID: "FixKitTests/AmountStyle.swift")
        let element = FixLocator.element(at: CGPoint(x: 310, y: 115), among: screen + [amount, styled], clips: [], fixable: nil)

        #expect(element?.source == source(70))
        #expect(element?.name == "Row › Text")
    }

    @Test func aSpacerIsNeverPressed() {
        let spacer = mark(Spacer.self, 23, CGRect(x: 130, y: 100, width: 150, height: 60))
        let element = FixLocator.element(at: CGPoint(x: 200, y: 130), among: screen + [spacer], clips: [], fixable: nil)

        #expect(element?.source == source(20))
    }

    @Test func nothingUnderThePoint() {
        #expect(FixLocator.element(at: CGPoint(x: 30, y: 900), among: screen, clips: [], fixable: nil) == nil)
    }
}

#if SourceLocations
private struct Badge: View {
    let title: String
    static let textLine = #line + 3
    var body: some View {
        HStack {
            Text(title).padding(8)
        }
    }
}

private struct Board: View {
    static let badgeLine = #line + 3
    var body: some View {
        VStack(spacing: 0) {
            Badge(title: "One")
            Spacer()
        }
    }
}

/// SwiftUI's own marks on a real screen: what a new SDK would break first.
@MainActor
struct FixLocatorOnScreenTests {
    private func window(_ root: UIViewController) async throws -> UIWindow {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        window.rootViewController = root
        window.isHidden = false
        window.layoutIfNeeded()
        try await Task.sleep(for: .milliseconds(100))
        return window
    }

    @Test func aPressNamesTheViewItsComponentAndWhereItIsUsed() async throws {
        let host = UIHostingController(rootView: Board())
        // The window's safe area would push the badge down by the status bar's height.
        host.safeAreaRegions = []
        let window = try await window(host)
        // Equal frames: the Badge where Board uses it, its HStack and its padded Text. SwiftUI
        // enumerates the outer first, so the Text is the pressed view.
        let element = FixLocator.element(at: CGPoint(x: 200, y: 18), in: window, fixable: nil)

        #expect(element?.name == "Badge › Text")
        #expect(element?.source == FixSource(file: #filePath, line: Badge.textLine))
        #expect(element?.usedAt.first == FixSource(file: #filePath, line: Board.badgeLine))
    }

    @Test func aUIKitScreenHasNoMarks() async throws {
        let window = try await window(UIViewController())

        #expect(FixLocator.element(at: CGPoint(x: 200, y: 18), in: window, fixable: nil) == nil)
    }
}
#endif

