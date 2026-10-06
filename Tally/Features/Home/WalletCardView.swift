import FixKit
import SwiftUI

struct WalletCardView: View {
    let card: PaymentCard

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(card.name)
                    .font(.ui(15, .semibold))
                Spacer()
                Image(systemName: "wave.3.right")
                    .font(.system(size: 18, weight: .semibold))
            }

            Spacer(minLength: 28)

            Text("••••  ••••  ••••  \(card.lastFour)")
                .font(.mono(20, .semibold))
                .fixable("card.number")

            Spacer(minLength: 22)

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("CARD HOLDER")
                        .font(.ui(9, .medium))
                        .opacity(0.7)
                    Text(card.holder)
                        .font(.ui(14, .medium))
                        .lineLimit(1)
                        .frame(width: 110, alignment: .leading)
                        .fixable("card.holderName")
                }

                Spacer()

                VStack(alignment: .leading, spacing: 3) {
                    Text("EXPIRES")
                        .font(.ui(9, .medium))
                        .opacity(0.7)
                    Text(card.expiry)
                        .font(.mono(14, .semibold))
                }

                Spacer()

                Text(card.network)
                    .font(.ui(17, .bold))
                    .italic()
            }
        }
        .foregroundStyle(.white)
        .padding(20)
        .frame(height: 200)
        .background {
            ZStack {
                LinearGradient(colors: card.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                Circle()
                    .fill(.white.opacity(0.12))
                    .frame(width: 220, height: 220)
                    .offset(x: 130, y: -90)
                Circle()
                    .fill(.white.opacity(0.08))
                    .frame(width: 180, height: 180)
                    .offset(x: -150, y: 110)
            }
        }
        .clipShape(.rect(cornerRadius: 26))
        .saturation(card.isFrozen ? 0.2 : 1)
        .shadow(color: card.gradient[0].opacity(0.35), radius: 22, y: 12)
    }
}
