// The receiver's way to an Android app, through adb. The emulator has a loopback of its own, so
// the receiver keeps its port reversed on every device, as the React Native CLI and Expo do for
// Metro's: the app reaches 127.0.0.1:4747 on both platforms. The screenshot and the accessibility
// tree come through adb too.
import { execFile } from 'node:child_process'
import { accessSync, constants, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Where adb may be, most specific first: the variable, the SDK the environment names, `PATH`, then
 * the SDK Android Studio installs. `FIXKIT_ADB`, when set, is the only place looked at.
 */
export function adbCandidates(env = process.env, home = homedir()) {
  const found = []
  const add = path => {
    try {
      accessSync(path, constants.X_OK)
      if (!found.includes(path)) found.push(path)
    } catch {}
  }

  if (env.FIXKIT_ADB !== undefined) {
    add(env.FIXKIT_ADB)
    return found
  }
  for (const sdk of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT].filter(Boolean)) add(join(sdk, 'platform-tools', 'adb'))
  for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) add(join(dir, 'adb'))
  add(join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'))
  return found
}

/** The serials `adb devices` lists as online; offline and unauthorized ones can't be served. */
export function parseDevices(stdout) {
  return stdout
    .split('\n')
    .map(line => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial)
}

/** The tcp forwards `adb forward --list` lists: the Mac's port and the device's, by device. */
export function parseForwards(stdout) {
  return stdout
    .split('\n')
    .map(line => line.trim().match(/^(\S+) tcp:(\d+) tcp:(\d+)$/))
    .filter(Boolean)
    .map(([, serial, host, device]) => ({ serial, host: Number(host), device: Number(device) }))
}

/**
 * The device a report came from when the app cannot say: the only one online, else the only one
 * on the app's API level `os`. `online` counts the devices.
 */
export async function pickDevice(serials, { os, sdkOf }) {
  const online = serials.length
  if (online === 1) return { serial: serials[0], online }
  if (online === 0 || !os) return { serial: null, online }
  const levels = await Promise.all(serials.map(serial => sdkOf(serial).catch(() => null)))
  const matching = serials.filter((_, index) => levels[index] === String(os))
  return { serial: matching.length === 1 ? matching[0] : null, online }
}

/** Whether an Android emulator runs on this Mac: its process is qemu's. */
export async function emulatorRunning() {
  try {
    await run('pgrep', ['-f', 'qemu-system'], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/** One adb binary's calls; each with a timeout, so a wedged adb server never holds a report. */
export class Adb {
  constructor(path) {
    this.path = path
  }

  async call(args, { serial, timeout = 10_000, encoding = 'utf8' } = {}) {
    const { stdout } = await run(this.path, serial ? ['-s', serial, ...args] : args, {
      timeout,
      encoding,
      maxBuffer: 32 * 1024 * 1024,
    })
    return stdout
  }

  async devices() {
    return parseDevices(await this.call(['devices']))
  }

  async forwards() {
    return parseForwards(await this.call(['forward', '--list']))
  }

  async sdkOf(serial) {
    return (await this.call(['shell', 'getprop', 'ro.build.version.sdk'], { serial })).trim() || null
  }

  async reverse(serial, port) {
    await this.call(['reverse', `tcp:${port}`, `tcp:${port}`], { serial })
  }

  async screencap(serial, path) {
    writeFileSync(path, await this.call(['exec-out', 'screencap', '-p'], { serial, encoding: 'buffer' }))
  }

  /** The screen's accessibility tree as uiautomator writes it, XML. */
  async dump(serial) {
    return this.call(['exec-out', 'uiautomator', 'dump', '/dev/tty'], { serial, timeout: 15_000 })
  }
}
