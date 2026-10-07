import { createElement, type ReactNode } from 'react'
import { Platform } from 'react-native'

// FixKit for React Native: long press anything in a development build running in the iOS
// simulator, type what is wrong, and the report goes to the Claude Code session listening on this
// Mac through the fixkit mod. Release bundles leave all of it out: Metro folds `__DEV__` and drops
// the branch, and the require with it.
const Host: ((props: { children: ReactNode }) => ReactNode) | null = __DEV__ ? require('./host').FixKitHost : null

/** Installs the long press, the report composer and the status banners. Wrap the app's root in it, once. */
export function FixKitHost({ children }: { children: ReactNode }) {
  if (Host === null || Platform.OS !== 'ios') return children
  return createElement(Host, null, children)
}
