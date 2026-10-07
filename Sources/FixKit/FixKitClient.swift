#if DEBUG
import UIKit

/// What the long press captured, before the comment is typed.
struct FixTarget {
    let element: FixElement?
    let touch: CGPoint
    let screen: String
    /// The pressed UIKit view's class and text, when the app's own view controller holds it.
    let viewDescription: String?
    let screenshot: Data?
}

struct FixStatus: Decodable {
    /// Identifies the receiver's run, so ids from an earlier session are told apart.
    let run: String
    let id: String?
    let status: String?
}

/// Talks to the receiver the fixkit mod runs on this Mac. The simulator
/// shares the Mac's loopback interface, so no address has to be configured.
enum FixKitClient {
    private static let base = URL(string: "http://127.0.0.1:4747")!

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 3
        return URLSession(configuration: configuration)
    }()

    /// Sends the report and returns the id the receiver gave it.
    static func send(_ target: FixTarget, comment: String) async throws -> String {
        var body: [String: Any] = [
            "comment": comment,
            "screen": target.screen,
            "touch": ["x": target.touch.x.rounded(), "y": target.touch.y.rounded()],
            "device": await UIDevice.current.name,
        ]
        // The receiver reads this simulator's accessibility tree to tell which element was pressed.
        if let simulator = ProcessInfo.processInfo.environment["SIMULATOR_UDID"] {
            body["simulator"] = simulator
        }
        if let element = target.element {
            var fields: [String: Any] = [
                "name": element.name,
                "frame": [
                    "x": element.frame.minX.rounded(), "y": element.frame.minY.rounded(),
                    "width": element.frame.width.rounded(), "height": element.frame.height.rounded(),
                ],
            ]
            if let source = element.source {
                fields["file"] = source.file
                fields["line"] = source.line
            }
            body["element"] = fields
        }
        if let viewDescription = target.viewDescription {
            body["viewDescription"] = viewDescription
        }
        if let screenshot = target.screenshot {
            body["screenshotPNG"] = screenshot.base64EncodedString()
        }

        var request = URLRequest(url: base.appending(path: "report"))
        request.httpMethod = "POST"
        // The receiver answers once it has read the screen's accessibility tree: a second or two.
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await session.data(for: request)
        return try JSONDecoder().decode(Receipt.self, from: data).id
    }

    /// The status of one report.
    static func status(of id: String) async throws -> FixStatus {
        let url = base.appending(path: "status").appending(queryItems: [URLQueryItem(name: "id", value: id)])
        let (data, _) = try await session.data(from: url)
        return try JSONDecoder().decode(FixStatus.self, from: data)
    }

    /// Says the app has launched, and returns the status of the report Claude is working on,
    /// else of the newest one.
    static func launched() async throws -> FixStatus {
        var request = URLRequest(url: base.appending(path: "launched"))
        request.httpMethod = "POST"
        let (data, _) = try await session.data(for: request)
        return try JSONDecoder().decode(FixStatus.self, from: data)
    }

    private struct Receipt: Decodable {
        let id: String
    }
}
#endif
