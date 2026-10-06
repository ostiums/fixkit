import SwiftUI

enum SpendingCategory: String, CaseIterable, Identifiable {
    case groceries = "Groceries"
    case transport = "Transport"
    case dining = "Dining"
    case subscriptions = "Subscriptions"
    case shopping = "Shopping"
    case travel = "Travel"
    case income = "Income"

    var id: String { rawValue }

    /// Fits under a chart bar.
    var shortName: String {
        switch self {
        case .groceries: "Food"
        case .transport: "Rides"
        case .subscriptions: "Subs"
        case .shopping: "Shop"
        default: rawValue
        }
    }

    var symbol: String {
        switch self {
        case .groceries: "basket.fill"
        case .transport: "car.fill"
        case .dining: "fork.knife"
        case .subscriptions: "repeat"
        case .shopping: "bag.fill"
        case .travel: "airplane"
        case .income: "arrow.down.left"
        }
    }
}

struct Transaction: Identifiable {
    let id: Int
    let merchant: String
    let note: String
    let category: SpendingCategory
    /// Positive for money in, negative for money out.
    let amount: Decimal
    let date: Date

    var isIncome: Bool { amount > 0 }
}

struct PaymentCard: Identifiable {
    let id: Int
    let name: String
    let holder: String
    let lastFour: String
    let expiry: String
    let network: String
    let gradient: [Color]
    let monthlyLimit: Decimal
    let spentThisMonth: Decimal
    var isFrozen: Bool
    var allowsOnlinePayments: Bool
}

struct DaySection: Identifiable {
    let day: Date
    let transactions: [Transaction]

    var id: Date { day }
    var total: Decimal { transactions.reduce(0) { $0 + $1.amount } }
}

struct CategoryTotal: Identifiable {
    let category: SpendingCategory
    let total: Decimal

    var id: String { category.id }
}
