/** Host views (`RCTText`) and wrappers (`withDevTools(App)`) say nothing about the app's code. */
const isNoise = (name: string) => name === '' || name.startsWith('RCT') || /^\w+\(.+\)$/.test(name)

/**
 * The element's name in a report: the last two components of the owner hierarchy React's inspector
 * gives, innermost last, as `WalletCard › Text`.
 */
export function elementName(hierarchy: string[]): string | null {
  const names = hierarchy.filter(name => !isNoise(name))
  return names.length === 0 ? null : names.slice(-2).join(' › ')
}
