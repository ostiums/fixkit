# react-native-fixkit

Long press any element of your React Native app in the iOS simulator, type what's wrong, press Return. The report lands in the Claude Code session running in your project, with the line of the element's JSX, a screenshot and your words. Claude fixes the code and Fast Refresh puts it on screen.

```bash
npm install --save-dev react-native-fixkit
```

```tsx
import { FixKitHost } from 'react-native-fixkit'

export default function App() {
  return (
    <FixKitHost>
      <RootNavigator />
    </FixKitHost>
  )
}
```

It needs the fixkit mod for Claude Code, React Native 0.80+ (React 19.1) with the New Architecture, and the iOS simulator. No native code: it works in Expo Go. Release bundles leave it out.

Setup, limits and how it works: [FixKit's README](https://github.com/ostiums/fixkit#react-native).

MIT.
