# FixKit

**Long press anything in your iOS or React Native app in the simulator, say what's wrong, and Claude Code or Codex fixes it.**

![iOS 17+](https://img.shields.io/badge/iOS-17%2B-blue) ![Swift 6](https://img.shields.io/badge/Swift-6-orange) ![SwiftUI, UIKit and React Native](https://img.shields.io/badge/SwiftUI%20%7C%20UIKit%20%7C%20React%20Native-supported-brightgreen) ![MIT](https://img.shields.io/badge/license-MIT-lightgrey)

![Long presses in the simulator send reports to Claude Code in the terminal: a shifted button, a corner radius, a single-colour chart and the tab bar, each fixed while the app relaunches](docs/demo.gif)

[Watch the demo in full quality (MP4, 47 s)](docs/demo.mp4)

**[Quick start](#quick-start) · [Codex](#codex) · [SwiftUI](#swiftui) · [UIKit](#uikit) · [React Native](#react-native) · [How it works](#how-it-works) · [Try it on Tally](#try-it-on-tally)**

1. **Long press** an element in the app and type what's wrong.
2. **The report lands** in the agent session already open in your project: your words, what was pressed, a screenshot.
3. **The agent fixes the code** and relaunches the app. A banner in the app follows the fix: queued, fixing, rebuilding, live.

FixKit has two parts:

- **In the app**, a debug-only library sends the reports: the **FixKit** Swift package for SwiftUI and UIKit, the **fixkit** npm package for React Native. Release builds contain none of it.
- **In the agent**, the **fixkit** plugin receives them. It runs a small local server, the receiver, on `127.0.0.1:4747` and turns each report into a prompt. The same plugin works in Claude Code and in Codex.

## Quick start

These steps are for a SwiftUI or UIKit app and Claude Code. With Codex, install the plugin as in [Codex](#codex); for React Native, see [React Native](#react-native).

**You need**

- Claude Code 2.1.287+ (or Codex CLI 0.159+) and Node.js 18.2+
- Xcode and an iOS 17+ simulator. FixKit works in the simulator only.

**Recommended**

- [AXe](https://github.com/cameroncooke/AXe), `brew install cameroncooke/axe/axe`. It tells which element the finger landed on. Without it, reports still arrive, with the screenshot and the touch point. The receiver looks for AXe in `FIXKIT_AXE`, then on `PATH`, then in the copy XcodeBuildMCP bundles.
- [XcodeBuildMCP](https://github.com/cameroncooke/XcodeBuildMCP), so the agent rebuilds and relaunches in one call, and the banner shows "rebuilding" while it does.

### 1. Install the plugin

```bash
claude plugin marketplace add ostiums/fixkit
claude plugin install fixkit@fixkit
```

From then on it loads in every Claude Code session and runs the receiver while the session is open.

### 2. Add the package

In Xcode: File › Add Package Dependencies › `https://github.com/ostiums/fixkit`, with the dependency rule **Branch: main**. Or in `Package.swift`:

```swift
.package(url: "https://github.com/ostiums/fixkit", branch: "main")
```

### 3. Add one line to the app

**SwiftUI**, on the root view:

```swift
import FixKit

WindowGroup {
    ContentView()
        .fixKitHost()
}
```

**UIKit**, on the main window once it is visible:

```swift
import FixKit

window.makeKeyAndVisible()
window.fixKitHost()
```

### 4. Run it

1. Add `.fixkit/` to `.gitignore`. The receiver keeps reports and screenshots there, in the folder where the agent was started.
2. Let Claude open the screenshots without asking. In the project's `.claude/settings.json`:

   ```json
   { "permissions": { "allow": ["Read(./.fixkit/**)"] } }
   ```

3. Start `claude` in the project's root.
4. Run a debug build in the simulator.
5. Long press an element, type what's wrong, press Return.

Claude Code shows a **Fix queue** pane with every report and its status. It opens by itself in terminals 144 columns or wider; `/fix-queue` opens it at any width. Reports sent while Claude is busy wait their turn.

## Codex

The same plugin works in Codex. A report arrives in the open Codex session as a queued message, and the app's banner follows it as it does with Claude Code. Everything else in [Quick start](#quick-start) stays the same: the package, the line in the app, `.fixkit/` in `.gitignore`.

```bash
codex plugin marketplace add ostiums/fixkit
codex plugin add fixkit@fixkit
```

1. Start `codex` in the project's root. The first time, Codex asks you to review the plugin's hooks. Trust them, there or later in `/hooks`: untrusted hooks don't run, and FixKit does nothing.
2. **Send the session a message before the first long press.** Codex runs the plugin's start hook with the session's first turn, and that hook starts the receiver. Until then the app answers a long press with "not listening". Any message works, your first task included. To be ready right away, start Codex with one:

   ```bash
   codex "FixKit"
   ```

   The same goes for a resumed session: FixKit starts again with its next message.
3. Run a debug build in the simulator, long press an element, type what's wrong, press Return.

How it differs from Claude Code:

- **No pane.** Codex has no plugin UI, so only the app's banners show progress. The banners say "Claude Code" with either agent. The receiver logs to `$TMPDIR/fixkit-codex.log`.
- **Only in app projects.** FixKit starts when Codex runs in a folder, or below one up to the git root, that holds an Xcode project or workspace, a `Package.swift`, or a `package.json` that depends on `react-native`. Anywhere else it starts nothing and adds nothing to the context.
- **Needs Codex's shared app-server**, the default. Reports reach the session through `codex queue`, which can't reach a session that runs its own server, as `codex --no-daemon` does.
- **Doesn't slow Codex down.** Codex waits only for the hooks at the session's start and end, and both finish quickly. The rest run in the background.
- **The session's end stops the receiver.** Long presses after that get "not listening". Reports Codex had queued but not yet started stay in the session's queue and run when you resume it, without a banner to follow them.

## Pointing at the right code

Nothing has to be marked. Marks make a report point at an exact line.

### SwiftUI

Without marks, the receiver reads the simulator's accessibility tree and names the element under the finger with the labels beside it. The agent finds the view by searching the sources for them:

```
[fix r1] StaticText "+€4,650.00" near "Northwind GmbH", "Salary, September" · Activity screen · .fixkit/reports/r1.png
```

Add `.fixable` to send the element's name, file and line as well:

```swift
VStack(alignment: .leading) {
    Text(card.number)
        .fixable("card.number")
    Text(card.holderName)
        .fixable("card.holderName")
}
.fixable("home.walletCard")
```

```
[fix r2] card.holderName · Features/Home/WalletCardView.swift:7 · StaticText "Alex Morgan" · .fixkit/reports/r2.png
```

- **The composer highlights the marked view**, and the screenshot outlines it. Without a mark, a ring shows where the finger was.
- **The innermost mark wins.** A press on the holder name reports `card.holderName`; anywhere else on the card, `home.walletCard`.
- **Mark the view whose code should change:** the `Text` for a typo or a colour, the container for spacing or layout.
- **Names are yours.** They may carry data: `.fixable("transaction.amount.\(merchant)")`.
- **`.fixScreen("Home")` names the screen** in reports of unmarked elements. With a `TabView`, `.fixScreen(selectedTab.rawValue)` keeps it current.

### UIKit

FixKit reads the views themselves, so even unmarked views are named precisely. It finds the stored property that holds the pressed view, in the view controller, a custom view or a cell, and sends the view's class and text with it:

```
[fix r1] ProfileViewController.nameLabel · UILabel "Alex Morgan" · .fixkit/reports/r1.png
```

- **Outlets, `lazy var`s and arrays** (`buttons[2]`) are found too. A press on a button's label names the button.
- **The nearest owner wins.** A label inside a custom card is named after the card's property, not the controller's.
- **No property?** A view made as a local `let` is reported as `UILabel "Alex Morgan" · ProfileViewController screen`.
- **Sheets stay separate.** A press inside a sheet never names a view of the screen beneath it.
- **No `.fixScreen` needed.** The view controller comes with every report.

For an exact line, mark the view. A mark wins over the property name:

```swift
let payButton = UIButton(configuration: .filled()).fixable("checkout.pay")
```

## React Native

The `fixkit` npm package brings the same flow to a React Native app in the iOS simulator. It is TypeScript with no native code, so it works in Expo Go as well as in a development build. It needs React Native 0.80+ (React 19.1, whose development builds record where each element's JSX is written) with the New Architecture.

![In Expo Go, a long press on a card holder's name cut off to "Alex…" sends "The name is cut off" to Claude Code; Claude removes a fixed width in WalletCard.tsx and Fast Refresh shows "Alex Morgan" with the banner "Fixed by Claude Code"](docs/demo-react-native.gif)

Install the plugin for your agent as in [Quick start](#1-install-the-plugin) or [Codex](#codex), then add the package:

```bash
npm install --save-dev fixkit
```

Wrap the app's root, once:

```tsx
import { FixKitHost } from 'fixkit'

export default function App() {
  return (
    <FixKitHost>
      <RootNavigator />
    </FixKitHost>
  )
}
```

### Build and run

FixKit runs in any development build that Metro serves. There is nothing to add to Xcode, the Podfile or `app.json`, and no `pod install`.

| Project | Run it in the simulator with |
| --- | --- |
| Expo, no native code of its own | `npx expo start --ios`, which opens it in Expo Go |
| Expo with a development build | `npx expo run:ios` once, then `npx expo start --ios` |
| React Native CLI | `npx react-native run-ios`, which starts Metro too |

- **Start `claude` or `codex` in the folder with the app's `package.json`.** That is how the plugin tells a React Native project from a native one, and where `.fixkit/` goes. Started in a parent folder, Claude Code gets the instructions for native apps and rebuilds where saving would do, and Codex may not start FixKit at all.
- **Keep Metro running.** Fast Refresh puts the agent's edits on screen, and the receiver reads source lines from the source map Metro serves.
- **No rebuild.** The agent saves the file, Fast Refresh puts it on screen and the report turns live. For a change to native code or native configuration (the Podfile, `Info.plist`, an Expo config plugin) the agent runs the project's own command from the table. XcodeBuildMCP isn't needed.
- **Release builds leave it out:** `npx expo run:ios --configuration Release`, an EAS build or an archive from Xcode. Metro drops the host along with `__DEV__`.

Nothing has to be marked. React records where each element's JSX is written, so a report names the components around the pressed element, the line of its JSX and where its component is used:

```
[fix r1] WalletCard › Text · src/WalletCard.tsx:11 · used at App.tsx:15 · StaticText "Alex Morgan" · .fixkit/reports/r1.png
```

- **`testID`s show up** in the accessibility description as `#id`.
- **The pressed button stays still.** While FixKit holds a press, `Pressable`, the `Touchable` components, `Button` and pressable `Text` neither long-press nor press on release. For that FixKit wraps React Native's private `Pressability` in development, and Metro warns once about the deep import. Gesture Handler's native buttons are not held.
- **Lines come from the code the app launched with.** Once Fast Refresh has changed a file, its lines in later reports can be a few off until the next reload; the agent is told to look around them.
- **The receiver does the native parts.** It takes the screenshot with `simctl` and reads the source lines from the map Metro served with the bundle. With several simulators booted on the same iOS version it can't tell which one runs the app, and reports come without a screenshot.
- **Not covered yet:** presses inside a native `Modal` or a natively presented screen, a second `<FixKitHost>` inside the first, and Android, where `<FixKitHost>` renders its children and nothing else.

`react-native/example` is a small Expo app to try it on:

```bash
cd react-native/example && npm install && npx expo start --ios
claude --plugin-dir ../../mod    # in the same folder: the plugin from this checkout
```

## How it works

```
app (FixKit) ──POST /report──▶ receiver (node, 127.0.0.1:4747) ──AXe describe-ui──▶ simulator
      ▲                               │ the report
      │ GET /status, POST /launched   ▼
      └────────── statuses ◀── Claude Code mod  or  Codex hooks
```

- **The long press** takes half a second and runs alongside the app's own gestures, so buttons, lists and scroll views keep working.
- **The composer and banners** live in FixKit's own window above the app. They cover sheets and stay out of screenshots. When the keyboard would hide the element, the app slides up.
- **The report** goes over the simulator's loopback, with no configuration. The receiver names the deepest element under the touch and saves the whole accessibility tree as `.fixkit/reports/<id>.ax.json`. A UIKit app's own description of the view comes first, since accessibility goes by position.
- **In Claude Code** the mod starts the receiver, submits each report as a prompt, explains the `[fix …]` line in the system prompt and writes the statuses to `.fixkit/status.json`.
- **In Codex** the hook at the session's start starts the receiver and gives Codex the same explanation. The receiver queues each prompt with `codex queue`, the other hooks tell it how the turn goes, and it keeps the statuses in memory.
- **The app polls** the receiver for the status of its report. Both agents follow the same rules, in `mod/core/`.
- **"Live"** means the app launched again while the agent worked on the report: through XcodeBuildMCP, `xcodebuild` and `simctl`, Run in Xcode, or, in React Native, a Fast Refresh.
- **One session at a time.** The session started last, in Claude Code or Codex, takes port 4747 over.
- **Release builds** compile FixKit out: `.fixKitHost()` returns the view unchanged and `window.fixKitHost()` does nothing. The package defines `DEBUG` for itself, whatever flags the app sets.

## Try it on Tally

`Tally/` is a SwiftUI wallet with four seeded UI bugs, linked to the package in this repository:

```bash
./scripts/reset-demo.sh          # puts the bugs back, builds, installs and launches Tally
claude --plugin-dir ./mod        # the plugin from this checkout
```

| Where | Long press | Say |
| --- | --- | --- |
| Home | the Send button | button is shifted |
| Home | the Top up button | corners don't match the others |
| Home or Cards | the card holder name | name is cut off |
| Home or Activity | a green-category amount, such as the salary | income should be green |

Each bug is a one-line slip; `reset-demo.sh` restores them from the git tag `demo-start`. The scripts use the iPhone 18 Pro simulator; set `SIMULATOR` to use another.

## Scripted recordings

For screen recordings, FixKit can play reports from a script instead of a finger. Switch it on in the simulator:

```bash
xcrun simctl spawn booted defaults write <bundle id> FixKitDirector -bool YES
```

Then serve steps from `http://127.0.0.1:4748/next`, one JSON object per request (204 when there are none):

```json
{"press": "card.holderName", "text": "The name is cut off"}
{"at": [321, 686], "text": "Income should be green"}
{"scroll": 260}
{"defaults": {"selectedTab": "Activity"}}
```

A press opens the composer on a `.fixable` element or at a point, types the text and sends it. A `defaults` step stores values for the app's next launch.

## Development

`scripts/test.sh` runs every check: plugin validation, the tests of the mod, the receiver and the Codex hooks, the React Native package's tests (Node.js 22.18+ runs their TypeScript as is), the Swift package's tests on the simulator, and Tally's Debug and Release builds.

## License

MIT, see [LICENSE](LICENSE).
