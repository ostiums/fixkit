import type { Accessibility, AxElement, FixReport, Incoming } from '../types'

/** What a `[fix …]` prompt calls for; sent with the system prompt while the mod is loaded. */
export const INSTRUCTIONS = `# Fix requests from the running app

A prompt that ends with a line like

[fix r1] StaticText "+€4,650.00" near "Northwind GmbH", "Salary, September" · Activity screen · .fixkit/reports/r1.png
[fix r2] home.quickActions.send · App/Home/QuickActions.swift:8 · Button "Send" · .fixkit/reports/r2.png
[fix r3] ProfileViewController.nameLabel · UILabel "Alex Morgan" · .fixkit/reports/r3.png

was sent from the iOS app running in the simulator by the fixkit mod: someone long-pressed an element and typed the text above that line. The line holds the report's id and what is known about the element: the name and the file and line of its .fixable("name") modifier when the app marks it; what accessibility says it is (its type, label, value, the control around it and the labels beside it in the same row); in a UIKit app, the view named after the property that holds it as Type.property, or its class and text, and its view controller as the screen; the screen's name when the app gives one; and a screenshot with the element outlined in red, or a red ring where the finger was.

When a prompt carries that line:
- Treat the text above it as the request. It may be a bug ("button is shifted") or a change ("make this green").
- With a file and line, start there: the cause is on that view or the one it wraps.
- With a Type.property name, start at that property's declaration and where it is configured.
- Without one, find the view by searching the Swift sources for the label and the labels beside it; a label made from data (an amount, a date) is found through the view that formats it, so search the neighbouring fixed labels first.
- Make the smallest change that does what was asked. Do not refactor.
- Open the screenshot only when the text and the code leave the request unclear.
- Then rebuild and relaunch the app in the simulator the way this project builds (XcodeBuildMCP's build_run_sim when it is connected), so the change is on screen: the report counts as fixed once the app has launched again.
- Answer in one or two sentences: what was wrong and what changed.`

/** What a `[fix …]` prompt calls for in a React Native project, in place of `INSTRUCTIONS`. */
export const RN_INSTRUCTIONS = `# Fix requests from the running app

A prompt that ends with a line like

[fix r1] WalletCard › Text · src/WalletCard.tsx:18 · used at App.tsx:31 · StaticText "Alex Morgan" · .fixkit/reports/r1.png
[fix r2] StaticText "+€4,650.00" near "Northwind GmbH", "Salary, September" · .fixkit/reports/r2.png

was sent from the React Native app running in the iOS simulator by the fixkit mod: someone long-pressed an element and typed the text above that line. The line holds the report's id and what is known about the element: the components that rendered it, innermost last; the file and line where its JSX is written; where the components around it are used; what accessibility says it is (its type, label, value, #testID, the control around it and the labels beside it in the same row); and a screenshot with the element outlined in red, or a red ring where the finger was.

When a prompt carries that line:
- Treat the text above it as the request. It may be a bug ("button is shifted") or a change ("make this green").
- With a file and line, start there: the cause is on that element, in the component around it, or in the props passed where that component is used. The line is read from the code the app launched with, so when that file has changed since, look around it.
- Without one, find the element by searching the app's .tsx, .ts, .jsx and .js sources for its label, its testID and the labels beside it; a label made from data (an amount, a date) is found through the component that formats it, so search the neighbouring fixed labels first.
- Make the smallest change that does what was asked. Do not refactor.
- Open the screenshot only when the text and the code leave the request unclear.
- Save the change and do not rebuild: Metro's Fast Refresh puts it on screen, which counts the report as fixed. Rebuild only when the change touches native code or native configuration, with the project's own command (npx expo run:ios, npx react-native run-ios).
- Answer in one or two sentences: what was wrong and what changed.`

/** Whether the project's package.json depends on React Native. */
export function isReactNativeProject(packageJson: string | null) {
  if (packageJson === null) return false
  try {
    const { dependencies = {}, devDependencies = {} } = JSON.parse(packageJson)
    return 'react-native' in dependencies || 'react-native' in devDependencies
  } catch {
    return false
  }
}

/** One accessibility element in words: its type, then its label, value and identifier. */
function describeOne(element: AxElement) {
  const parts = [element.type]
  if (element.label) parts.push(JSON.stringify(element.label))
  if (element.value && element.value !== element.label) parts.push(`= ${JSON.stringify(element.value)}`)
  if (element.identifier) parts.push(`#${element.identifier}`)
  return parts.join(' ')
}

/** What accessibility says was pressed, in one phrase for the prompt and the pane. */
export function describeAccessibility({ element, within, nearby }: Accessibility) {
  let text = describeOne(element)
  if (within) text += ` in ${describeOne(within)}`
  if (nearby.length > 0) text += ` near ${nearby.map(label => JSON.stringify(label)).join(', ')}`
  return text
}

/**
 * The prompt: the person's comment as they typed it, then one line of context.
 * `INSTRUCTIONS` tells the model what a message carrying a `[fix …]` line calls for.
 */
export function promptFor(incoming: Incoming, source: string | null, usedAt: string[] = []) {
  const { comment, element, id, screen, screenshot, touch } = incoming
  const pressed = describePressed(incoming)
  const context = [
    element?.name,
    source,
    usedAt.length > 0 ? `used at ${usedAt.join(', ')}` : null,
    pressed,
    // A marked element says where it is; otherwise the screen's name helps find it.
    !element && screen ? `${screen} screen` : null,
    !element && !pressed && touch ? `touch at ${Math.round(touch.x)},${Math.round(touch.y)}` : null,
    screenshot,
  ].filter((part): part is string => Boolean(part))

  return `${comment}\n\n[fix ${id}] ${context.join(' · ')}`
}

/**
 * What was pressed in words. A UIKit app describes the very view it found under the finger, so its
 * words come first; accessibility, read by position, can name a view under a sheet or a container.
 */
function describePressed({
  accessibility,
  viewDescription,
}: {
  accessibility?: Accessibility | null
  viewDescription?: string | null
}) {
  return viewDescription ?? (accessibility ? describeAccessibility(accessibility) : null)
}

/** How the pane names what was pressed: the element's name, else what the app or accessibility said. */
export function pressedLabel(report: Pick<FixReport, 'element' | 'accessibility' | 'viewDescription' | 'screen'>) {
  const { element, screen } = report
  if (element) return element
  const pressed = describePressed(report)
  if (pressed) return pressed
  return screen ? `${screen} screen` : 'unnamed element'
}

/**
 * Whether a tool call is XcodeBuildMCP's build-and-run, during which the pane shows the report
 * as rebuilding. Whether the fix reached the screen comes from the app itself, when it launches.
 */
export function isBuildAndRun(tool: string) {
  return /(?:^|_)build_run_sim$/.test(tool)
}
