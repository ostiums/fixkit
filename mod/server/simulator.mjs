// The simulator a report came from when the app cannot say, and the screenshot such an app cannot
// take: a React Native app knows its iOS version, not its simulator's UDID, and JavaScript has no
// way to capture the screen. Both through simctl.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * The simulator booted on iOS `os` ('27.0'), from `simctl list devices booted -j`'s answer, when
 * exactly one is; without `os`, the only one booted at all. `booted` counts the candidates.
 */
export function pickSimulator(list, os) {
  const runtime = os ? `.iOS-${os.split('.').slice(0, 2).join('-')}` : null
  const booted = Object.entries(list.devices ?? {})
    .filter(([key]) => runtime === null || key.endsWith(runtime))
    .flatMap(([, devices]) => devices.filter(one => one.state === 'Booted'))
  return { udid: booted.length === 1 ? booted[0].udid : null, booted: booted.length }
}

export async function bootedSimulator(os) {
  const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  return pickSimulator(JSON.parse(stdout), os)
}

export async function captureScreen(udid, path) {
  await run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', path], { timeout: 10_000 })
}
