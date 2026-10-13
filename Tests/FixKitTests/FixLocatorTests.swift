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
    private func mark(
        _ type: Any.Type, _ line: Int, _ frame: CGRect, depth: Int, fileID: String = "FixKitTests/Screen.swift"
    ) -> FixMark {
        FixMark(fileID: fileID, source: FixSource(file: "/App/\(fileID)", line: line), type: type, frame: frame, depth: depth)
    }

    private func source(_ line: Int) -> FixSource {
        FixSource(file: "/App/FixKitTests/Screen.swift", line: line)
    }

    /// A screen with one row, in the order SwiftUI paints them: each view right before the views
    /// inside it, one level deeper.
    private var screen: [FixMark] {
        [
            mark(Screen.self, 1, CGRect(x: 0, y: 0, width: 400, height: 800), depth: 0),
            mark(VStack<Row>.self, 10, CGRect(x: 0, y: 0, width: 400, height: 800), depth: 1),
            mark(ModifiedContent<Row, _PaddingLayout>.self, 12, CGRect(x: 0, y: 100, width: 400, height: 60), depth: 2),
            mark(HStack<Text>.self, 20, CGRect(x: 0, y: 100, width: 400, height: 60), depth: 3),
            mark(Text.self, 21, CGRect(x: 20, y: 110, width: 100, height: 20), depth: 4),
        ]
    }

    @Test func theInnermostViewNamesItsComponentAndWhereItIsUsed() {
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen, clips: [])

        #expect(element?.name == "Row › Text")
        #expect(element?.source == source(21))
        #expect(element?.usedAt == [source(12), source(1)])
        #expect(element?.frame == CGRect(x: 20, y: 110, width: 100, height: 20))
    }

    @Test func ofEqualFramesTheLaterPaintedIsInner() {
        let element = FixLocator.element(at: CGPoint(x: 300, y: 130), among: screen, clips: [])

        #expect(element?.name == "Row › HStack")
        #expect(element?.source == source(20))
        #expect(element?.usedAt.first == source(12))
    }

    @Test func aTransparentContainerDrawnOverTheContentDoesNotWin() {
        let overlay = mark(VStack<Spacer>.self, 30, CGRect(x: 0, y: 0, width: 400, height: 800), depth: 1)
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen + [overlay], clips: [])

        #expect(element?.source == source(21))
    }

    @Test func decorationGivesWayToTheContent() {
        let circle = mark(_ShapeView<Circle, Color>.self, 15, CGRect(x: 25, y: 112, width: 10, height: 10), depth: 3)
        var marks = screen
        marks.insert(circle, at: 3)

        let onText = FixLocator.element(at: CGPoint(x: 30, y: 115), among: marks, clips: [])
        #expect(onText?.source == source(21))

        // A colour filling the row behind it, painted after the row's HStack.
        let fill = mark(Color.self, 16, CGRect(x: 0, y: 100, width: 400, height: 60), depth: 4)
        let onFill = FixLocator.element(at: CGPoint(x: 300, y: 125), among: screen + [fill], clips: [])
        #expect(onFill?.source == source(20))
    }

    @Test func onlyDecorationUnderThePointGivesTheInnermost() {
        let circle = mark(Circle.self, 15, CGRect(x: 0, y: 0, width: 50, height: 50), depth: 0)
        let element = FixLocator.element(at: CGPoint(x: 10, y: 10), among: [circle], clips: [])

        #expect(element?.name == "Circle")
    }

    @Test func contentScrolledPastTheScrollViewsEdgeIsNotUnderTheBar() {
        let row = mark(HStack<Text>.self, 20, CGRect(x: 0, y: 680, width: 400, height: 60), depth: 0)
        let bar = mark(HStack<Text>.self, 40, CGRect(x: 0, y: 700, width: 400, height: 100), depth: 0)
        let element = FixLocator.element(
            at: CGPoint(x: 30, y: 720), among: [row, bar], clips: [CGRect(x: 0, y: 0, width: 400, height: 700)])

        #expect(element?.source == source(40))
    }

    @Test func aFrameIsCutOnlyWhereItCrossesAScrollView() {
        let scroll = CGRect(x: 0, y: 0, width: 400, height: 700)

        #expect(FixLocator.clipped(CGRect(x: 0, y: 0, width: 400, height: 800), to: [scroll]) == CGRect(x: 0, y: 0, width: 400, height: 800))
        #expect(FixLocator.clipped(CGRect(x: 0, y: 720, width: 400, height: 60), to: [scroll]) == CGRect(x: 0, y: 720, width: 400, height: 60))
        #expect(FixLocator.clipped(CGRect(x: 0, y: 680, width: 400, height: 60), to: [scroll]) == CGRect(x: 0, y: 680, width: 400, height: 20))
    }

    @Test func fixKitsOwnViewsAreNeverChosen() {
        let own = mark(Text.self, 5, CGRect(x: 25, y: 112, width: 5, height: 5), depth: 5, fileID: "FixKit/FixKit.swift")
        let element = FixLocator.element(at: CGPoint(x: 27, y: 114), among: screen + [own], clips: [])

        #expect(element?.source == source(21))
    }

    @Test func aFixableOnTheComponentLendsItsName() {
        var marks = screen
        marks.insert(FixMark(fixable: "row.coffee", frame: CGRect(x: 0, y: 100, width: 400, height: 60), depth: 3), at: 3)
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: marks, clips: [])

        #expect(element?.name == "row.coffee › Text")
        #expect(element?.source == source(21))
    }

    @Test func aFixableAroundTheNearestComponentDoesNot() {
        var marks = screen
        marks.insert(FixMark(fixable: "screen", frame: CGRect(x: 0, y: 0, width: 400, height: 800), depth: 1), at: 1)
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: marks, clips: [])

        #expect(element?.name == "Row › Text")
    }

    @Test func aRingDrawnAroundAnIconGivesWayToIt() {
        let icon = mark(Image.self, 50, CGRect(x: 60, y: 520, width: 40, height: 40), depth: 1)
        let ring = mark(StrokeBorderShapeView<Circle, Color, EmptyView>.self, 51, CGRect(x: 60, y: 520, width: 40, height: 40), depth: 2)
        let element = FixLocator.element(at: CGPoint(x: 80, y: 540), among: screen + [icon, ring], clips: [])

        #expect(element?.source == source(50))
    }

    @Test func aViewDrawnOverPartOfAnotherCoversIt() {
        // A row's label scrolled under a tab button: the button is painted later and does not hold it.
        let label = mark(Text.self, 21, CGRect(x: 90, y: 806, width: 96, height: 14), depth: 4)
        let button = mark(VStack<Text>.self, 60, CGRect(x: 12, y: 778, width: 126, height: 62), depth: 1)
        let element = FixLocator.element(at: CGPoint(x: 100, y: 812), among: screen + [label, button], clips: [])

        #expect(element?.source == source(60))
    }

    @Test func aContainerPaintedLaterIsNotAComponent() {
        let overlay = mark(Screen.self, 30, CGRect(x: 0, y: 0, width: 400, height: 800), depth: 1)
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen + [overlay], clips: [])

        #expect(element?.usedAt == [source(12), source(1)])
    }

    @Test func aFixableBesideThePressedViewDoesNotLendItsName() {
        let tab = mark(VStack<Text>.self, 40, CGRect(x: 0, y: 100, width: 25, height: 60), depth: 1)
        let fixable = FixMark(fixable: "tab.home", frame: CGRect(x: 0, y: 100, width: 25, height: 60), depth: 2)
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: screen + [tab, fixable], clips: [])

        #expect(element?.name == "Row › Text")
    }

    @Test func anAppShapeBehindTheContentIsNoComponent() {
        // The row's content laid over the card's shape: the shape is around it.
        var marks = screen.map { mark in
            mark.depth < 3 ? mark : self.mark(mark.type, mark.source.line, mark.frame, depth: mark.depth + 1)
        }
        marks.insert(mark(ModifiedContent<CardShape, _OverlayModifier<HStack<Text>>>.self, 13, CGRect(x: 0, y: 100, width: 400, height: 60), depth: 3), at: 3)
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: marks, clips: [])

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
        let bar = mark(ModifiedContent<_ShapeView<Capsule, Color>, _FrameLayout>.self, 22, CGRect(x: 200, y: 140, width: 150, height: 6), depth: 4)
        let element = FixLocator.element(at: CGPoint(x: 250, y: 142), among: screen + [bar], clips: [])

        #expect(element?.name == "Row › Capsule")
        #expect(element?.source == source(22))
    }

    @Test func aModifiersContentStandsForTheViewItModifies() {
        let amount = mark(ModifiedContent<Text, AmountStyle>.self, 70, CGRect(x: 300, y: 110, width: 60, height: 20), depth: 4)
        let styled = mark(
            ModifiedContent<_ViewModifier_Content<AmountStyle>, _EnvironmentKeyWritingModifier<Font.Weight?>>.self, 3,
            CGRect(x: 300, y: 110, width: 60, height: 20), depth: 5, fileID: "FixKitTests/AmountStyle.swift")
        let element = FixLocator.element(at: CGPoint(x: 310, y: 115), among: screen + [amount, styled], clips: [])

        #expect(element?.source == source(70))
        #expect(element?.name == "Row › Text")
    }

    @Test func aSpacerIsNeverPressed() {
        let spacer = mark(Spacer.self, 23, CGRect(x: 130, y: 100, width: 150, height: 60), depth: 4)
        let element = FixLocator.element(at: CGPoint(x: 200, y: 130), among: screen + [spacer], clips: [])

        #expect(element?.source == source(20))
    }

    @Test func aViewWhoseMarkIsMissingLeavesItsViewsToTheOneAroundIt() {
        let marks = [screen[0], screen[2], screen[4]]
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: marks, clips: [])

        #expect(element?.name == "Row › Text")
        #expect(element?.usedAt == [source(12), source(1)])
    }

    /// A sheet's or a pushed screen's hosting controller inherits the depth of the view that shows it.
    @Test func marksThatStartDeepStillMakeATree() {
        let marks = screen.map { mark($0.type, $0.source.line, $0.frame, depth: $0.depth + 7) }
        let element = FixLocator.element(at: CGPoint(x: 30, y: 115), among: marks, clips: [])

        #expect(element?.name == "Row › Text")
        #expect(element?.usedAt == [source(12), source(1)])
    }

    /// A header pinned over a row, painted after it: the row holds the header's text but is no view around it.
    @Test func aRowUnderAPinnedHeaderIsNotItsComponent() {
        let row = mark(Row.self, 60, CGRect(x: 0, y: 50, width: 400, height: 60), depth: 1)
        let header = mark(Screen.self, 40, CGRect(x: 0, y: 0, width: 400, height: 100), depth: 1)
        let title = mark(Text.self, 41, CGRect(x: 0, y: 80, width: 60, height: 20), depth: 2)
        let element = FixLocator.element(at: CGPoint(x: 20, y: 90), among: [screen[0], row, header, title], clips: [])

        #expect(element?.usedAt == [source(40), source(1)])
    }

    @Test func nothingUnderThePoint() {
        #expect(FixLocator.element(at: CGPoint(x: 30, y: 900), among: screen, clips: []) == nil)
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

/// QuickActions' Send: the button moved by an offset outside its .fixable.
private struct ActionButton: View {
    var body: some View {
        // The icon on the leading edge stays inside the button's frame when moved, the button does not.
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "paperplane").frame(width: 60, height: 60)
            Text("Send")
        }
        .frame(width: 90, alignment: .leading)
    }
}

private struct Actions: View {
    static let buttonLine = #line + 2
    var body: some View {
        ActionButton()
            .fixable("send")
            .offset(x: 16, y: 10)
    }
}

/// A tag moved by an offset over a row of another view.
private struct Tag: View {
    var body: some View { Text("Tag").padding(4) }
}

private struct ShelfRow: View {
    let index: Int
    var body: some View {
        HStack { Text("Row \(index)"); Spacer() }.frame(height: 60)
    }
}

private struct Shelf: View {
    static let tagLine = #line + 6
    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 0) {
                ForEach(0..<8, id: \.self) { ShelfRow(index: $0) }
            }
            Tag()
                .fixable("tag")
                .offset(x: 30, y: 200)
        }
    }
}

/// A section header pinned over the rows scrolled under it.
private struct LedgerHeader: View {
    var body: some View {
        VStack(alignment: .leading) {
            Text("Today")
        }
        .frame(maxWidth: .infinity, minHeight: 100, alignment: .bottomLeading)
        .background(Color.white)
    }
}

private struct LedgerRow: View {
    let index: Int
    var body: some View {
        HStack { Text("Row \(index)"); Spacer() }.frame(height: 60)
    }
}

private struct Ledger: View {
    static let headerLine = #line + 7
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                Section {
                    ForEach(0..<20, id: \.self) { LedgerRow(index: $0).fixable("ledger.row\($0)") }
                } header: {
                    LedgerHeader()
                }
            }
        }
    }
}

/// A .fixable on the layer behind the text, not on a view around it.
private struct Plate: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12).fill(Color.gray).fixable("plate.background")
            Text("Balance")
        }
        .frame(width: 200, height: 100)
    }
}

private struct Total: View {
    var body: some View {
        VStack {
            Text("Total").fixable("total.title")
            Text("€10")
        }
    }
}

/// A .fixable around a container that holds the component.
private struct Totals: View {
    var body: some View {
        VStack { Total() }.fixable("totals")
    }
}

/// SwiftUI hands its environment, and so the marks' depth, on to a pushed screen's own hosting controller.
private struct Detail: View {
    var body: some View {
        VStack { Text("Detail").fixable("detail.title") }
    }
}

private struct Navigator: View {
    static let detailLine = #line + 4
    var body: some View {
        NavigationStack {
            Text("Root").navigationDestination(isPresented: .constant(true)) {
                Detail()
            }
        }
    }
}

/// SwiftUI's own marks on a real screen: what a new SDK would break first. One screen at a time:
/// the .fixable registry is shared.
@MainActor
@Suite(.serialized)
struct FixLocatorOnScreenTests {
    private func window(_ root: UIViewController, wait: Duration = .milliseconds(100)) async throws -> UIWindow {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        window.rootViewController = root
        window.isHidden = false
        window.layoutIfNeeded()
        try await Task.sleep(for: wait)
        return window
    }

    /// The screen in a window of its own, laid out without the safe area. The builder marks the
    /// screen's view as the hosting controller's root view would not be.
    private func window<Content: View>(
        wait: Duration = .milliseconds(100), @ViewBuilder showing content: () -> Content
    ) async throws -> UIWindow {
        let host = UIHostingController(rootView: content())
        host.safeAreaRegions = []
        return try await window(host, wait: wait)
    }

    /// The frame of a .fixable on screen.
    private func frame(of name: String) throws -> CGRect {
        try #require(FixRegistry.shared.element(named: name)).frame
    }

    @Test func aPressNamesTheViewItsComponentAndWhereItIsUsed() async throws {
        let window = try await window { Board() }
        // Equal frames: the Badge where Board uses it, its HStack and its padded Text. SwiftUI
        // enumerates the outer first, so the Text is the pressed view.
        let element = FixLocator.element(at: CGPoint(x: 200, y: 18), in: window)

        #expect(element?.name == "Badge › Text")
        #expect(element?.source == FixSource(file: #filePath, line: Badge.textLine))
        #expect(element?.usedAt.first == FixSource(file: #filePath, line: Board.badgeLine))
    }

    @Test func aUIKitScreenHasNoMarks() async throws {
        let window = try await window(UIViewController())

        #expect(FixLocator.element(at: CGPoint(x: 200, y: 18), in: window) == nil)
    }

    @Test func aFixableMovedByAnOffsetStillNamesTheView() async throws {
        let window = try await window { Actions() }
        let button = try frame(of: "send")
        let element = FixLocator.element(at: CGPoint(x: button.minX + 30, y: button.minY + 30), in: window)

        #expect(element?.name == "send › Image")
        #expect(element?.usedAt.first == FixSource(file: #filePath, line: Actions.buttonLine))
    }

    @Test func aViewMovedOverAnotherIsUsedWhereItIsWritten() async throws {
        let window = try await window { Shelf() }
        let tag = try frame(of: "tag")
        let element = FixLocator.element(at: CGPoint(x: tag.midX, y: tag.midY), in: window)

        #expect(element?.name == "tag › Text")
        #expect(element?.usedAt.first == FixSource(file: #filePath, line: Shelf.tagLine))
    }

    @Test func aPinnedHeaderIsNotPartOfTheRowUnderIt() async throws {
        let window = try await window { Ledger() }
        let scroll = try #require(window.descendants.lazy.compactMap { $0 as? UIScrollView }.first)
        // The header pinned at the top, 100 high, and the second row 50 to 110 under it.
        scroll.setContentOffset(CGPoint(x: 0, y: 110), animated: false)
        window.layoutIfNeeded()
        try await Task.sleep(for: .milliseconds(200))
        let element = FixLocator.element(at: CGPoint(x: 20, y: 90), in: window)

        #expect(element?.name == "LedgerHeader › Text")
        #expect(element?.usedAt.first == FixSource(file: #filePath, line: Ledger.headerLine))
    }

    /// The name belongs to the view the .fixable is on, here the plate's background.
    @Test func aFixableOnALayerBehindThePressedViewDoesNotNameIt() async throws {
        let window = try await window { Plate() }
        let plate = try frame(of: "plate.background")
        let element = FixLocator.element(at: CGPoint(x: plate.midX, y: plate.midY), in: window)

        #expect(element?.name == "Plate › Text")
    }

    @Test func aFixableOnThePressedViewNamesIt() async throws {
        let window = try await window { Totals() }
        let title = try frame(of: "total.title")
        let element = FixLocator.element(at: CGPoint(x: title.midX, y: title.midY), in: window)

        #expect(element?.name == "total.title › Text")
    }

    @Test func aFixableAroundTheComponentsContainerDoesNotNameIt() async throws {
        let window = try await window { Totals() }
        let title = try frame(of: "total.title")
        // The amount, right under the title.
        let element = FixLocator.element(at: CGPoint(x: title.midX, y: title.maxY + 12), in: window)

        #expect(element?.name == "Total › Text")
    }

    @Test func aViewOnAPushedScreenNamesWhereItIsUsed() async throws {
        let window = try await window(wait: .seconds(1)) { Navigator() }
        let title = try frame(of: "detail.title")
        let element = FixLocator.element(at: CGPoint(x: title.midX, y: title.midY), in: window)

        #expect(element?.name == "detail.title › Text")
        #expect(element?.usedAt.first == FixSource(file: #filePath, line: Navigator.detailLine))
    }
}
#endif

