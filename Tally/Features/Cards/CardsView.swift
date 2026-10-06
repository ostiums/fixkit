import FixKit
import SwiftUI

struct CardsView: View {
    @State private var cards = SampleData.cards
    @State private var selectedCardID: Int? = SampleData.cards[0].id

    private var selectedIndex: Int {
        cards.firstIndex { $0.id == selectedCardID } ?? 0
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Cards")
                    .font(.ui(30, .bold))
                    .foregroundStyle(Theme.textPrimary)
                    .padding(.horizontal, 20)
                    .fixable("cards.title")

                ScrollView(.horizontal) {
                    HStack(spacing: 14) {
                        ForEach(cards) { card in
                            WalletCardView(card: card)
                                .containerRelativeFrame(.horizontal)
                                .id(card.id)
                        }
                    }
                    .scrollTargetLayout()
                    .padding(.bottom, 26)
                }
                .contentMargins(.horizontal, 20, for: .scrollContent)
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $selectedCardID)
                .scrollClipDisabled()
                .scrollIndicators(.hidden)

                VStack(alignment: .leading, spacing: 22) {
                    limit
                    settings
                    details
                }
                .padding(.horizontal, 20)
            }
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }

    private var limit: some View {
        let card = cards[selectedIndex]
        let progress = NSDecimalNumber(decimal: card.spentThisMonth / card.monthlyLimit).doubleValue

        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Monthly limit")

            HStack(alignment: .firstTextBaseline) {
                Text(Money.string(card.spentThisMonth))
                    .font(.mono(22, .bold))
                    .foregroundStyle(Theme.textPrimary)
                Text("of \(Money.string(card.monthlyLimit))")
                    .font(.ui(13))
                    .foregroundStyle(Theme.textSecondary)
            }

            ProgressView(value: min(progress, 1))
                .tint(card.gradient[1])
                .scaleEffect(y: 1.8)
        }
        .card()
        .fixable("cards.monthlyLimit")
    }

    private var settings: some View {
        VStack(spacing: 0) {
            SettingRow(
                title: "Freeze card", subtitle: "Block all payments instantly", symbol: "snowflake",
                isOn: $cards[selectedIndex].isFrozen
            )
            .fixable("cards.settings.freeze")

            Divider().overlay(Theme.stroke).padding(.leading, 58)

            SettingRow(
                title: "Online payments", subtitle: "Allow purchases on the web", symbol: "globe",
                isOn: $cards[selectedIndex].allowsOnlinePayments
            )
            .fixable("cards.settings.onlinePayments")
        }
        .card(padding: 4)
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Account details")

            VStack(alignment: .leading, spacing: 4) {
                Text("IBAN")
                    .font(.ui(12))
                    .foregroundStyle(Theme.textSecondary)
                Text(SampleData.iban)
                    .font(.mono(14, .semibold))
                    .foregroundStyle(Theme.textPrimary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .fixable("cards.accountDetails")
    }
}

private struct SettingRow: View {
    let title: String
    let subtitle: String
    let symbol: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.iconInk)
                    .frame(width: 42, height: 42)
                    .background(Theme.surfaceRaised, in: .circle)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.ui(15, .medium))
                        .foregroundStyle(Theme.textPrimary)
                    Text(subtitle)
                        .font(.ui(12))
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        }
        .tint(Theme.accent)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

#Preview {
    CardsView().background(Theme.background)
}
