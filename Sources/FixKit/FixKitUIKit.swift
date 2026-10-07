import UIKit

// The UIKit side of FixKit: the same host and marks as the SwiftUI modifiers, for apps built
// on view controllers.

extension UIView {
    /// Optional: names the view and records the source line it was marked on, so its reports
    /// point at that line. Unmarked views are named after the property that holds them.
    @discardableResult
    public func fixable(_ name: String, file: String = #filePath, line: Int = #line) -> Self {
        #if DEBUG
        FixRegistry.shared.mark(self, name: name, file: file, line: line)
        #endif
        return self
    }
}
