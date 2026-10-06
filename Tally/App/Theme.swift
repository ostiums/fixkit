import CoreText
import SwiftUI

enum Theme {
    static let background = Color(red: 0.035, green: 0.043, blue: 0.071)
    static let surface = Color(red: 0.082, green: 0.094, blue: 0.141)
    static let surfaceRaised = Color(red: 0.118, green: 0.133, blue: 0.192)
    static let stroke = Color.white.opacity(0.07)
    static let accent = Color(red: 0.38, green: 0.93, blue: 0.69)
    static let positive = Color(red: 0.38, green: 0.93, blue: 0.69)
    static let negative = Color(red: 1.00, green: 0.42, blue: 0.45)
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.56)
    /// Icons that label rather than act: neutral, so colour is left to mean something.
    static let iconInk = Color.white.opacity(0.78)
    /// Chart marks: a neutral tinted from the background's navy, not a hue per category.
    static let chartMark = Color(red: 0.60, green: 0.66, blue: 0.84)
    static let cornerRadius: CGFloat = 22

    /// Registers the bundled fonts; call once before the first view is drawn.
    static func registerFonts() {
        for name in ["Roboto", "iAWriterMonoV"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

extension Font {
    /// Roboto, the interface font.
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let face = switch weight {
        case .bold, .heavy, .black: "Roboto-Bold"
        case .semibold: "Roboto-SemiBold"
        case .medium: "Roboto-Medium"
        case .light, .thin, .ultraLight: "Roboto-Light"
        default: "Roboto-Regular"
        }
        return .custom(face, fixedSize: size)
    }

    /// iA Writer Mono, for amounts and card numbers.
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let face = switch weight {
        case .bold, .heavy, .black: "iAWriterMonoV-Bold"
        case .semibold, .medium: "iAWriterMonoV-Semibold"
        default: "iAWriterMonoV-Regular"
        }
        return .custom(face, fixedSize: size)
    }
}

enum Money {
    private static let formatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "EUR"
        formatter.currencySymbol = "€"
        formatter.locale = Locale(identifier: "en_IE")
        return formatter
    }()

    static func string(_ amount: Decimal) -> String {
        formatter.string(from: abs(amount) as NSDecimalNumber) ?? "€0.00"
    }

    /// "+€64.95" for money in, "−€7.40" for money out.
    static func signed(_ amount: Decimal) -> String {
        (amount > 0 ? "+" : "−") + string(amount)
    }
}

struct SectionHeader: View {
    let title: String
    var action: String?

    var body: some View {
        HStack {
            Text(title)
                .font(.ui(18, .semibold))
                .foregroundStyle(Theme.textPrimary)
            Spacer()
            if let action {
                Text(action)
                    .font(.ui(14, .medium))
                    .foregroundStyle(Theme.accent)
            }
        }
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .background(Theme.surface, in: .rect(cornerRadius: Theme.cornerRadius))
            .overlay {
                RoundedRectangle(cornerRadius: Theme.cornerRadius).strokeBorder(Theme.stroke)
            }
    }
}
