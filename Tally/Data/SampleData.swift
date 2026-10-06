import SwiftUI

/// Deterministic stub data: every launch shows the same account.
enum SampleData {
    static let ownerFirstName = "Vladimir"
    static let ownerFullName = "Vladimir Berestnev"
    static let balance: Decimal = 12_480.56
    static let monthDelta: Decimal = 842.10
    static let iban = "DE89 3704 0044 0532 0130 00"

    /// The day the stubs are anchored to, so "Today" stays today in every take.
    static let today = Calendar.current.startOfDay(for: .now)

    static let cards: [PaymentCard] = [
        PaymentCard(
            id: 1, name: "Everyday", holder: ownerFullName, lastFour: "4821", expiry: "09/29",
            network: "VISA",
            gradient: [Color(red: 0.36, green: 0.31, blue: 0.95), Color(red: 0.13, green: 0.76, blue: 0.84)],
            monthlyLimit: 3_000, spentThisMonth: 1_184.37, isFrozen: false, allowsOnlinePayments: true
        ),
        PaymentCard(
            id: 2, name: "Travel", holder: ownerFullName, lastFour: "0937", expiry: "02/28",
            network: "Mastercard",
            gradient: [Color(red: 0.98, green: 0.45, blue: 0.36), Color(red: 0.93, green: 0.25, blue: 0.56)],
            monthlyLimit: 5_000, spentThisMonth: 2_316.90, isFrozen: false, allowsOnlinePayments: true
        ),
        PaymentCard(
            id: 3, name: "Savings", holder: ownerFullName, lastFour: "7710", expiry: "11/30",
            network: "VISA",
            gradient: [Color(red: 0.11, green: 0.14, blue: 0.22), Color(red: 0.22, green: 0.29, blue: 0.42)],
            monthlyLimit: 1_000, spentThisMonth: 96.00, isFrozen: true, allowsOnlinePayments: false
        ),
    ]

    static let transactions: [Transaction] = {
        // (days ago, hour, minute, merchant, note, category, amount)
        let rows: [(Int, Int, Int, String, String, SpendingCategory, Decimal)] = [
            (0, 9, 12, "Five Elephant", "Flat white, croissant", .dining, -7.40),
            (0, 8, 31, "BVG", "Single ticket AB", .transport, -3.50),
            (0, 7, 2, "Northwind GmbH", "Salary, September", .income, 4_650.00),
            (1, 20, 44, "Uber", "Mitte → Kreuzberg", .transport, -14.80),
            (1, 19, 5, "Mustafa's Gemüse Kebap", "Dinner", .dining, -9.50),
            (1, 13, 20, "Lidl", "Groceries", .groceries, -43.18),
            (1, 10, 0, "Spotify", "Premium Family", .subscriptions, -17.99),
            (2, 18, 37, "Apple", "iCloud+ 200 GB", .subscriptions, -2.99),
            (2, 16, 2, "Zalando", "Refund, order 10482", .income, 64.95),
            (2, 12, 48, "REWE", "Groceries", .groceries, -61.72),
            (3, 21, 15, "Netflix", "Standard plan", .subscriptions, -13.99),
            (3, 17, 30, "Decathlon", "Running shoes", .shopping, -89.99),
            (3, 8, 50, "Deutsche Bahn", "Berlin → Hamburg", .travel, -37.90),
            (4, 19, 55, "Lieferando", "Sushi for two", .dining, -34.60),
            (4, 14, 10, "DM", "Household", .groceries, -22.35),
            (5, 22, 3, "Bolt", "Scooter ride", .transport, -4.20),
            (5, 11, 41, "IKEA", "Shelf, lamp", .shopping, -128.00),
            (6, 20, 18, "Lufthansa", "BER → LIS", .travel, -214.30),
            (6, 9, 9, "Anna Becker", "Split: weekend trip", .income, 120.00),
            (7, 18, 26, "Edeka", "Groceries", .groceries, -38.04),
            (7, 13, 0, "Vapiano", "Lunch", .dining, -16.90),
            (8, 15, 47, "Amazon", "USB-C hub", .shopping, -45.99),
            (8, 8, 15, "BVG", "Monthly pass", .transport, -58.00),
            (9, 19, 33, "Booking.com", "Lisbon, 3 nights", .travel, -342.00),
            (10, 12, 12, "Lidl", "Groceries", .groceries, -29.87),
            (10, 10, 30, "GitHub", "Copilot", .subscriptions, -10.00),
            (11, 21, 2, "Zur Letzten Instanz", "Dinner", .dining, -58.40),
            (12, 16, 45, "Uniqlo", "Jacket", .shopping, -79.90),
            (12, 9, 20, "Uber", "Airport transfer", .transport, -31.60),
            (13, 18, 8, "REWE", "Groceries", .groceries, -54.11),
            (14, 11, 11, "Tax Office Berlin", "Tax refund 2025", .income, 318.42),
            (15, 20, 40, "Yorck Kinos", "2 tickets", .dining, -24.00),
            (16, 13, 25, "MediaMarkt", "Headphones", .shopping, -149.00),
            (17, 8, 5, "Flixbus", "Berlin → Prague", .travel, -19.99),
            (18, 19, 19, "Edeka", "Groceries", .groceries, -47.63),
            (19, 10, 10, "Notion", "Plus plan", .subscriptions, -9.50),
            (20, 14, 52, "Tier", "Scooter ride", .transport, -3.80),
            (21, 20, 6, "Burgermeister", "Dinner", .dining, -13.20),
            (22, 12, 0, "Max Schulz", "Rent share", .income, 410.00),
            (23, 17, 17, "Airbnb", "Prague, 2 nights", .travel, -168.00),
        ]

        return rows.enumerated().map { index, row in
            let day = Calendar.current.date(byAdding: .day, value: -row.0, to: today)!
            let date = Calendar.current.date(bySettingHour: row.1, minute: row.2, second: 0, of: day)!
            return Transaction(
                id: index, merchant: row.3, note: row.4, category: row.5, amount: row.6, date: date)
        }
    }()

    static var recentTransactions: [Transaction] { Array(transactions.prefix(6)) }

    static var days: [DaySection] {
        Dictionary(grouping: transactions) { Calendar.current.startOfDay(for: $0.date) }
            .map { DaySection(day: $0.key, transactions: $0.value.sorted { $0.date > $1.date }) }
            .sorted { $0.day > $1.day }
    }

    static var spendingByCategory: [CategoryTotal] {
        Dictionary(grouping: transactions.filter { !$0.isIncome }, by: \.category)
            .map { CategoryTotal(category: $0.key, total: $0.value.reduce(0) { $0 - $1.amount }) }
            .sorted { $0.total > $1.total }
    }

    static var totalSpent: Decimal { spendingByCategory.reduce(0) { $0 + $1.total } }
    static var totalIncome: Decimal {
        transactions.filter(\.isIncome).reduce(0) { $0 + $1.amount }
    }
}
