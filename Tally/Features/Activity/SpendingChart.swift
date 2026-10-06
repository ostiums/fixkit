import Charts
import FixKit
import SwiftUI

struct SpendingChart: View {
    private let totals = SampleData.spendingByCategory

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Spending by category", action: "30 days")

            Chart(totals) { item in
                BarMark(
                    x: .value("Category", item.category.shortName),
                    y: .value("Spent", NSDecimalNumber(decimal: item.total).doubleValue)
                )
                .foregroundStyle(Theme.chartMark)
                .cornerRadius(7)
            }
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine().foregroundStyle(Theme.stroke)
                    AxisValueLabel {
                        if let amount = value.as(Double.self) {
                            Text("€\(Int(amount))")
                                .font(.mono(10))
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }
                }
            }
            .chartXAxis {
                AxisMarks { value in
                    AxisValueLabel {
                        if let name = value.as(String.self) {
                            Text(name)
                                .font(.ui(10, .medium))
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }
                }
            }
            .frame(height: 180)
        }
        .card()
        .fixable("activity.spendingChart")
    }
}
