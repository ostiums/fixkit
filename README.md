# FixKit

Long press any element of your iOS app in the simulator, type what is wrong, press Return. The report lands in the Claude Code session already running in your project: the element, a screenshot, your words. Claude fixes the code and relaunches the app, and a banner in the app follows the fix from queued to live.

![Long presses in the simulator send reports to Claude Code in the terminal: a shifted button, a corner radius, a single-colour chart and the tab bar, each fixed while the app relaunches](docs/demo.gif)

[Watch the demo in full quality (MP4, 47 s)](docs/demo.mp4)

FixKit has two parts:

- **the fixkit mod** for Claude Code receives the reports;
- **the FixKit Swift package** sends them from a debug build of a SwiftUI or UIKit app. Release builds compile it away.

## Requirements

- Claude Code 2.1.287 or later.
- Node.js 18.2 or later; the mod's receiver runs on it.
- Xcode, and an iOS 17 or later simulator. FixKit works in the simulator only.
- [AXe](https://github.com/cameroncooke/AXe), which tells which element a report's touch landed on. The mod looks for it in `FIXKIT_AXE`, then on `PATH`, then in the copy [XcodeBuildMCP](https://github.com/cameroncooke/XcodeBuildMCP) bundles in the npx cache. Otherwise run `brew install cameroncooke/axe/axe`. Without AXe, reports still arrive with the screenshot and the touch point.
- XcodeBuildMCP is recommended so Claude rebuilds and relaunches with one call.

## Installation

### 1. The mod

```bash
claude plugin marketplace add ostiums/fixkit
claude plugin install fixkit@fixkit
```

The mod loads in every Claude Code session from then on. It starts its receiver on `127.0.0.1:4747` when a session starts, and stops it when the session ends.

### 2. The package

In Xcode, choose File › Add Package Dependencies, enter `https://github.com/ostiums/fixkit` and add the FixKit library to your app target. In a `Package.swift`:

```swift
.package(url: "https://github.com/ostiums/fixkit", from: "0.1.0")
```

### 3. One line in the app

In a SwiftUI app, a modifier on the root view:

```swift
import FixKit
import SwiftUI

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .fixKitHost()
        }
    }
}
```

In a UIKit app, a call on the main window once it is visible, in the scene delegate:

```swift
import FixKit
import UIKit

func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: scene)
    window.rootViewController = RootViewController()
    window.makeKeyAndVisible()
    window.fixKitHost()
    self.window = window
}
```

That is the whole integration. The next section explains what it installs.

### 4. The project folder

The mod writes reports to `.fixkit/` in the folder where `claude` runs, so start it in the project's root and add `.fixkit/` to `.gitignore`. To let Claude open the screenshots without asking each time, allow it in the project's Claude Code settings:

```json
{ "permissions": { "allow": ["Read(./.fixkit/**)"] } }
```

## What `fixKitHost()` installs

The package does nothing until it runs. It does four things:

- **The long press.** It adds one long-press recognizer to the app's window, recognized alongside the app's own gestures. Buttons, lists and scroll views keep working; once a press has lasted half a second it belongs to FixKit, and the control under the finger does not also act on it.
- **The composer.** It draws the dimmed screen with the pressed element lit and the comment field above the keyboard. When the keyboard would cover the element, it slides the app up.
- **The banners.** It shows the report's progress at the top of the screen: sent, queued, fixing, rebuilding, fixed.
- **The launch signal.** At every launch it tells the receiver the app is up. A launch while Claude works on a report is how the mod learns the fix is on screen, whether Claude rebuilt through XcodeBuildMCP, `xcodebuild` and `simctl`, or you pressed Run in Xcode. After the relaunch the app picks up the report's progress again.

The composer and the banners live in a window of FixKit's own above the app's window, so they cover sheets and full-screen covers too, and stay out of report screenshots. That window lets every touch through to the app unless the composer is open. Install it once: a second call does nothing.

In a release build `.fixKitHost()` returns the view unchanged, `window.fixKitHost()` does nothing, and none of FixKit is compiled in. The package defines `DEBUG` for its own debug builds, whatever flags the app's project sets.

## Using `.fixable`

Nothing has to be marked. Without marks, the receiver reads the simulator's accessibility tree and names the element under the finger, with the labels beside it. Claude then finds the view by searching the sources for those labels:

```
Income should be green

[fix r1] StaticText "+€4,650.00" near "Northwind GmbH", "Salary, September" · Activity screen · .fixkit/reports/r1.png
```

Mark an element with `.fixable` when you want its reports to point at an exact line:

```swift
struct WalletCardView: View {
    var body: some View {
        VStack(alignment: .leading) {
            Text(card.number)
                .fixable("card.number")
            Text(card.holderName)
                .fixable("card.holderName")
        }
        .fixable("home.walletCard")
    }
}
```

What a mark changes:

- **The report names the element and its line.** The modifier records its own `file:line` from the call site. The prompt leads with the name and the path relative to the project, so Claude starts reading at that line:

  ```
  [fix r2] card.holderName · Features/Home/WalletCardView.swift:7 · StaticText "Alex Morgan" · .fixkit/reports/r2.png
  ```

- **The composer lights the element's frame** and labels it with the name and the file, and the screenshot outlines that frame. Without a mark, the screenshot has a ring where the finger was.
- **Nested marks resolve to the innermost one.** A press on the holder name above reports `card.holderName`, a press elsewhere on the card reports `home.walletCard`.

Put the mark on the view whose code you want Claude to open: the `Text` itself for a typo or a colour, the container for spacing or layout. A name only has to make sense to you; it may carry data, as in `.fixable("transaction.amount.\(transaction.merchant)")`. In a release build a mark returns the view unchanged; in a debug build it records the element's frame as the layout changes.

`.fixScreen("Home")` names the screen on display. The name goes with every report as `Home screen`, which helps Claude find unmarked elements. Apply it to each screen's root view; with a `TabView`, `.fixScreen(selectedTab.rawValue)` on the tab view keeps it current.

## UIKit views

In a UIKit app FixKit reads the views themselves, so an unmarked view is still named precisely. At a press it takes the view under the finger, labels and images included, and looks for the stored property that holds it in the app's own objects around it: the view controller, a custom view, a cell. The report names that property, the view's class and text, and the view controller as the screen:

```
The name is cut off

[fix r1] ProfileViewController.nameLabel · StaticText "Alex Morgan" · .fixkit/reports/r1.png
```

`@IBOutlet`s, `lazy var`s and arrays of views (`buttons[2]`) are found the same way. A press on a button's own label names the button. When no property holds the view, a local `let` in `viewDidLoad` say, the report carries `UILabel "Alex Morgan" · ProfileViewController screen`.

To point a report at an exact line, mark the view, as `.fixable` does in SwiftUI:

```swift
let payButton = UIButton(configuration: .filled()).fixable("checkout.pay")
```

A mark wins over the property name when both cover the same view. In a release build `fixable` returns the view and records nothing.

## Use it

1. Run the app in the simulator from a debug build.
2. Start `claude` in the project folder. The Fix queue pane opens in a terminal 144 columns or wider; `/fix-queue` opens it at any width.
3. Long press an element in the app, type what is wrong, press Return.

The pane and the banner in the app move through `queued`, `fixing`, `rebuilding` and `live`. A report turns live when the app launches again while Claude works on it, and stays live if Claude finishes with an answer. Reports sent while Claude works on one wait in the queue.

## How it works

```
app (FixKit) ──POST /report──▶ receiver (node, 127.0.0.1:4747) ──AXe describe-ui──▶ simulator
      ▲                               │ one JSON line per report
      │ POST /launched, GET /status   ▼
      └──────── .fixkit/status.json ◀── the mod: prompt, Fix queue pane, statuses
```

The simulator shares the Mac's loopback interface, so the app reaches the receiver with no configuration. The app sends a report once its composer has closed, and the receiver reads the simulator's accessibility tree before it answers; until then the app takes no new long press. The receiver picks the deepest named element under the touch point and the labels beside it in the same row, and saves the whole tree as `.fixkit/reports/<id>.ax.json`. The mod submits the prompt and adds a section to the system prompt that explains the `[fix …]` line. It writes every report's status to `.fixkit/status.json`, which the app polls.

One session receives reports at a time: a session started later takes port 4747 over.

## Example: Tally

`Tally/` is a SwiftUI wallet with four seeded UI bugs, linked to the package in this repository.

```bash
./scripts/reset-demo.sh          # puts the bugs back, builds, installs and launches Tally
claude --plugin-dir ./mod        # the mod from this checkout
```

| Where | Long press | A comment that works |
| --- | --- | --- |
| Home | the Send button | button is shifted |
| Home | the Top up button | corners don't match the others |
| Home or Cards | the card holder name | name is cut off |
| Home or Activity | a green-category amount such as the salary | income should be green |

Each one is a one-line slip in the code. The reset script restores them from the git tag `demo-start`. Both scripts use the iPhone 18 Pro simulator; set `SIMULATOR` to name another.

## Scripted recordings

For screen recordings FixKit can play reports from a script instead of a finger. Switch it on in the simulator, then serve steps as JSON from `http://127.0.0.1:4748/next`, one per request (204 when there are none):

```bash
xcrun simctl spawn booted defaults write <bundle id> FixKitDirector -bool YES
```

```json
{"press": "card.holderName", "text": "The name is cut off"}
{"at": [321, 686], "text": "Income should be green"}
{"scroll": 260}
{"defaults": {"selectedTab": "Activity"}}
```

A press opens the composer on a `.fixable` element or a point, types the text letter by letter and sends it. A `defaults` step stores values for the app to read at its next launch.

## Development

`scripts/test.sh` runs every check: `claude plugin validate` on the marketplace and the mod, the mod's tests (`claude plugin test mod`), the receiver's tests (`node --test`), the Swift package's tests on the simulator, and Tally's Debug and Release builds.

## License

MIT, see [LICENSE](LICENSE).
