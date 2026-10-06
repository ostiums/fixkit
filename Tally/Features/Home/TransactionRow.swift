import FixKit
import SwiftUI

struct TransactionRow: View {
    let transaction: Transaction

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.category.symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.iconInk)
                .frame(width: 42, height: 42)
                .background(Theme.surfaceRaised, in: .circle)

            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.merchant)
                    .font(.ui(15, .medium))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                Text(transaction.note)
                    .font(.ui(12))
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 3) {
                Text(Money.signed(transaction.amount))
                    .font(.mono(15, .semibold))
                    .foregroundStyle(transaction.isIncome ? Theme.negative : Theme.textPrimary)
                    .fixable("transaction.amount.\(transaction.merchant)")
                Text(transaction.date, format: .dateTime.hour().minute())
                    .font(.ui(12))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .fixable("transaction.row.\(transaction.merchant)")
    }
}
