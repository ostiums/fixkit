import FixKit
import SwiftUI

struct QuickActions: View {
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            QuickActionButton(title: "Send", symbol: "arrow.up.right")
                .fixable("home.quickActions.send")
                .offset(x: 16, y: 10)

            QuickActionButton(title: "Request", symbol: "arrow.down.left")
                .fixable("home.quickActions.request")

            QuickActionButton(title: "Top up", symbol: "plus", cornerRadius: 2)
                .fixable("home.quickActions.topUp")

            QuickActionButton(title: "More", symbol: "ellipsis")
                .fixable("home.quickActions.more")
        }
    }
}

struct QuickActionButton: View {
    let title: String
    let symbol: String
    var cornerRadius: CGFloat = 20

    var body: some View {
        Button {} label: {
            VStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 60, height: 60)
                    .background(Theme.surfaceRaised, in: .rect(cornerRadius: cornerRadius))
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius).strokeBorder(Theme.stroke)
                    }

                Text(title)
                    .font(.ui(13, .medium))
                    .foregroundStyle(Theme.textPrimary)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
