import FixKit
import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case home = "Home"
    case activity = "Activity"
    case cards = "Cards"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .activity: "chart.bar.fill"
        case .cards: "creditcard.fill"
        }
    }
}

struct RootView: View {
    private static let storageKey = "selectedTab"

    /// Starts on the tab that was open last, so a rebuild reopens the screen that was on display.
    @State private var selectedTab =
        UserDefaults.standard.string(forKey: storageKey).flatMap(AppTab.init) ?? .home

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch selectedTab {
                case .home: HomeView()
                case .activity: ActivityView()
                case .cards: CardsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            TabBar(selection: $selectedTab)
        }
        .background(Theme.background)
        .onChange(of: selectedTab) { _, tab in
            UserDefaults.standard.set(tab.rawValue, forKey: Self.storageKey)
        }
        .fixScreen(selectedTab.rawValue)
    }
}

private struct TabBar: View {
    @Binding var selection: AppTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases) { tab in
                Button {
                    selection = tab
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 19, weight: .semibold))
                        Text(tab.rawValue)
                            .font(.ui(11, .medium))
                    }
                    .foregroundStyle(selection == tab ? Theme.accent : Theme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
                .fixable("tabBar.\(tab.rawValue.lowercased())")
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .background(Theme.surface, ignoresSafeAreaEdges: .bottom)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.stroke).frame(height: 1)
        }
    }
}
