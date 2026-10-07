#if DEBUG
import SwiftUI

private let fixTint = Color(red: 0.85, green: 0.47, blue: 0.34)

/// FixKit's own views carry identifiers under `fixkit.`; the receiver's accessibility lookup
/// skips them, so a report never names the composer or a banner.
func fixKitIdentifier(_ name: String) -> String {
    "fixkit.\(name)"
}

/// The dimmed screen with the pressed element lit, and the comment field above the keyboard.
struct FixComposerOverlay: View {
    let target: FixTarget
    let session: FixSession

    @State private var isPulsing = false
    @State private var labelWidth: CGFloat = 0
    @FocusState private var isFocused: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            spotlight
                .ignoresSafeArea()
                .onTapGesture { session.cancel() }

            composer
                .padding(.horizontal, 14)
                .padding(.bottom, 10)
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { top in
                    // Slides the app up when the keyboard would cover the pressed element.
                    let bottom = (target.element?.frame.maxY ?? target.touch.y) + 28
                    withAnimation(.snappy(duration: 0.3)) { session.lift = max(0, bottom - top) }
                }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(fixKitIdentifier("composer"))
        .onAppear {
            isFocused = true
            withAnimation(.easeInOut(duration: 0.9).repeatForever()) { isPulsing = true }
        }
    }

    private var spotlight: some View {
        GeometryReader { proxy in
            let origin = proxy.frame(in: .global).origin
            let frame = (target.element?.frame ?? CGRect(origin: target.touch, size: .zero))
                .offsetBy(dx: -origin.x, dy: -origin.y - session.lift)
                .insetBy(dx: target.element == nil ? -28 : -6, dy: target.element == nil ? -28 : -6)
            let shape = RoundedRectangle(cornerRadius: target.element == nil ? 28 : 12)

            ZStack(alignment: .topLeading) {
                Color.black.opacity(0.62)
                    .mask {
                        Rectangle()
                            .overlay {
                                shape
                                    .frame(width: frame.width, height: frame.height)
                                    .position(x: frame.midX, y: frame.midY)
                                    .blendMode(.destinationOut)
                            }
                            .compositingGroup()
                    }

                shape
                    .strokeBorder(fixTint, lineWidth: 2)
                    .shadow(color: fixTint.opacity(isPulsing ? 0.95 : 0.35), radius: isPulsing ? 16 : 6)
                    .frame(width: frame.width, height: frame.height)
                    .position(x: frame.midX, y: frame.midY)

                if let title {
                    label(title)
                        .fixedSize()
                        .onGeometryChange(for: CGFloat.self, of: \.size.width) { labelWidth = $0 }
                        .position(
                            x: min(max(frame.midX, labelWidth / 2 + 12), proxy.size.width - labelWidth / 2 - 12),
                            y: frame.minY > 120 ? frame.minY - 22 : frame.maxY + 22)
                }
            }
        }
    }

    /// The marked element and its source line, else the screen's name when the app gives one.
    private var title: String? {
        if let element = target.element {
            guard let source = element.source else { return element.name }
            return "\(element.name)  ·  \((source.file as NSString).lastPathComponent):\(source.line)"
        }
        return target.screen.isEmpty ? nil : "\(target.screen) screen"
    }

    private func label(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(fixTint, in: .capsule)
    }

    private var composer: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(fixTint)

            TextField("What should Claude fix here?", text: Bindable(session).draft)
                .font(.system(size: 16))
                .foregroundStyle(.white)
                .tint(fixTint)
                .focused($isFocused)
                .submitLabel(.send)
                .autocorrectionDisabled()
                .onSubmit(submit)
                .onKeyPress(.return) {
                    submit()
                    return .handled
                }

            Button(action: submit) {
                Image(systemName: "return")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(session.draft.isEmpty ? Color.white.opacity(0.14) : fixTint, in: .circle)
            }
            .disabled(session.draft.isEmpty)
        }
        .padding(.leading, 16)
        .padding(.trailing, 7)
        .padding(.vertical, 7)
        .background(.ultraThinMaterial, in: .capsule)
        .overlay { Capsule().strokeBorder(fixTint.opacity(0.55)) }
        .shadow(color: .black.opacity(0.4), radius: 18, y: 8)
    }

    private func submit() {
        session.send(comment: session.draft.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

struct FixBanner: View {
    let banner: FixSession.Banner

    var body: some View {
        HStack(spacing: 8) {
            if banner.isWorking {
                ProgressView().controlSize(.small).tint(.white)
            } else {
                Image(systemName: banner.symbol)
                    .font(.system(size: 13, weight: .bold))
            }
            Text(banner.text)
                .font(.system(size: 14, weight: .semibold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(fixTint, in: .capsule)
        .shadow(color: .black.opacity(0.35), radius: 14, y: 6)
    }
}
#endif
