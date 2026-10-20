# fixkit for Flutter

Long press any widget of your Flutter app in the iOS simulator or the Android emulator, type what's wrong, press Return. The report lands in the Claude Code or Codex session running in your project, with the line where the widget is constructed, a screenshot and your words. The agent fixes the code and hot reloads the app.

```yaml
dependencies:
  fixkit:
    git:
      url: https://github.com/ostiums/fixkit.git
      path: flutter
```

```dart
import 'package:fixkit/fixkit.dart';

void main() => runApp(const FixKitHost(child: MyApp()));
```

It needs the fixkit plugin for Claude Code or Codex, Flutter 3.35+, the iOS simulator or the Android emulator (with adb from the SDK's platform-tools) and an app started with `flutter run`. Dart only, no native code, nothing to add to the Podfile or the Gradle files. Release builds, desktop apps and the web get the child alone.

Setup, limits and how it works: [FixKit's README](https://github.com/ostiums/fixkit#flutter).

MIT.
