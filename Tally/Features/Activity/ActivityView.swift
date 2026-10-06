import FixKit
import SwiftUI

struct ActivityView: View {
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                Text("Activity")
                    .font(.ui(30, .bold))
                    .foregroundStyle(Theme.textPrimary)
                    .fixable("activity.title")

                totals
                SpendingChart()

                ForEach(SampleData.days) { section in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(title(for: section.day))
                                .font(.ui(14, .semibold))
                                .foregroundStyle(Theme.textSecondary)
                            Spacer()
                            Text(Money.signed(section.total))
                                .font(.mono(13))
                                .foregroundStyle(Theme.textSecondary)
                        }
                        .fixable("activity.dayHeader")

                        VStack(spacing: 0) {
                            ForEach(section.transactions) { transaction in
                                TransactionRow(transaction: transaction)
                            }
                        }
                        .card(padding: 4)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }

    private var totals: some View {
        HStack(spacing: 12) {
            TotalTile(title: "Spent", amount: SampleData.totalSpent, symbol: "arrow.up.right", tint: Theme.negative)
                .fixable("activity.totals.spent")
            TotalTile(title: "Received", amount: SampleData.totalIncome, symbol: "arrow.down.left", tint: Theme.positive)
                .fixable("activity.totals.received")
        }
    }

    private func title(for day: Date) -> String {
        if Calendar.current.isDateInToday(day) { return "Today" }
        if Calendar.current.isDateInYesterday(day) { return "Yesterday" }
        return day.formatted(.dateTime.weekday(.wide).day().month(.abbreviated))
    }
}

private struct TotalTile: View {
    let title: String
    let amount: Decimal
    let symbol: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(tint)
                Text(title)
                    .font(.ui(13, .medium))
                    .foregroundStyle(Theme.textSecondary)
            }
            Text(Money.string(amount))
                .font(.mono(19, .bold))
                .foregroundStyle(Theme.textPrimary)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

#Preview {
    ActivityView().background(Theme.background)
}
