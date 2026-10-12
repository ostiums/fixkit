#if DEBUG && SourceLocations
import SwiftUI

/// Where a view expression is written, and its type. Every view a `@ViewBuilder` or `body` builds
/// carries one through the identifier Xcode Previews' selection uses; FixLocator reads them back.
public struct FixSourceMark: Hashable {
    /// `Module/File.swift`: the module tells FixKit's own views and the app's types apart.
    let fileID: String
    let file: String
    let line: Int
    let type: Any.Type

    public static func == (a: Self, b: Self) -> Bool {
        a.line == b.line && a.file == b.file && a.type == b.type
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(file)
        hasher.combine(line)
        hasher.combine(ObjectIdentifier(type))
    }
}

extension ViewBuilder {
    /// ViewBuilder declares no buildExpression of its own, so this one sees every view expression
    /// in every module that imports FixKit.
    public static func buildExpression<Content: View>(
        _ content: Content, fileID: String = #fileID, file: String = #filePath, line: Int = #line
    ) -> ModifiedContent<Content, _IdentifiedModifier<FixSourceMark>> {
        content.modifier(
            _IdentifiedModifier(identifier: FixSourceMark(fileID: fileID, file: file, line: line, type: Content.self)))
    }

    /// Chart content and anything else that is not a view goes through as is.
    @_disfavoredOverload
    public static func buildExpression<Other>(_ other: Other) -> Other { other }
}
#endif
