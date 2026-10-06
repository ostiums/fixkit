import FixKit
import SwiftUI

struct BalanceSummary: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Total balance")
                .font(.ui(14))
                .foregroundStyle(Theme.textSecondary)

            Text(Money.string(SampleData.balance))
                .font(.mono(40, .bold))
                .foregroundStyle(Theme.textPrimary)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
                .fixable("home.balance.amount")

            HStack(spacing: 6) {
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 11, weight: .bold))
                Text("\(Money.string(SampleData.monthDelta)) this month")
                    .font(.ui(13, .medium))
            }
            .foregroundStyle(Theme.positive)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Theme.positive.opacity(0.14), in: .capsule)
            .fixable("home.balance.monthDelta")
        }
    }
}
