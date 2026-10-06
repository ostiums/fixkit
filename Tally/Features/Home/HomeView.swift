import FixKit
import SwiftUI

struct HomeView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                BalanceSummary()
                WalletCardView(card: SampleData.cards[0])
                    .fixable("home.walletCard")
                QuickActions()
                recentActivity
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text("VB")
                .font(.ui(15, .bold))
                .foregroundStyle(Theme.background)
                .frame(width: 42, height: 42)
                .background(Theme.accent, in: .circle)
                .fixable("home.header.avatar")

            VStack(alignment: .leading, spacing: 2) {
                Text("Good morning")
                    .font(.ui(13))
                    .foregroundStyle(Theme.textSecondary)
                Text(SampleData.ownerFirstName)
                    .font(.ui(18, .semibold))
                    .foregroundStyle(Theme.textPrimary)
            }
            .fixable("home.header.greeting")

            Spacer()

            Image(systemName: "bell.badge.fill")
                .font(.system(size: 17, weight: .semibold))
                .symbolRenderingMode(.palette)
                .foregroundStyle(Theme.negative, Theme.textPrimary)
                .frame(width: 42, height: 42)
                .background(Theme.surface, in: .circle)
                .fixable("home.header.notifications")
        }
    }

    private var recentActivity: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Recent activity", action: "See all")
                .fixable("home.recentActivity.header")

            VStack(spacing: 0) {
                ForEach(SampleData.recentTransactions) { transaction in
                    TransactionRow(transaction: transaction)
                    if transaction.id != SampleData.recentTransactions.last?.id {
                        Divider().overlay(Theme.stroke).padding(.leading, 58)
                    }
                }
            }
            .card(padding: 4)
        }
    }
}

#Preview {
    HomeView().background(Theme.background)
}
