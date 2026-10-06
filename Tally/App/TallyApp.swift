import FixKit
import SwiftUI

@main
struct TallyApp: App {
    init() {
        Theme.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .fixKitHost()
        }
    }
}
