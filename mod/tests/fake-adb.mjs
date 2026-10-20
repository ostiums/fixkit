// Test helper: an adb that answers from a script, for the receiver's Android side without an emulator.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Runs as adb: answers from adb.json beside it and logs every call to adb.log.
const PROGRAM = `
const { appendFileSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const here = __dirname
const script = JSON.parse(readFileSync(join(here, 'adb.json'), 'utf8'))
let args = process.argv.slice(2)
appendFileSync(join(here, 'adb.log'), JSON.stringify(args) + '\\n')
let serial = null
if (args[0] === '-s') {
  serial = args[1]
  args = args.slice(2)
}
const call = args.join(' ')
if (call === 'devices') process.stdout.write(script.devices ?? 'List of devices attached\\n\\n')
else if (call === 'forward --list') process.stdout.write(script.forwards ?? '')
else if (call === 'shell getprop ro.build.version.sdk') process.stdout.write((script.sdk?.[serial] ?? '') + '\\n')
else if (args[0] === 'reverse') process.exit(0)
else if (call === 'exec-out screencap -p') process.stdout.write(Buffer.from(script.png ?? '', 'base64'))
else if (call === 'exec-out uiautomator dump /dev/tty') {
  if (script.dump === null) {
    process.stderr.write('ERROR: could not get idle state.\\n')
    process.exit(1)
  }
  process.stdout.write((script.dump ?? '') + 'UI hierchary dumped to: /dev/tty\\n')
} else process.exit(1)
`

/**
 * Writes an executable fake adb into `dir` and returns its path. Calling it again for the same
 * folder changes what the fake answers: a device that comes or goes, say. `png` is a Buffer.
 */
export function fakeAdb(dir, { devices, forwards, sdk, dump, png } = {}) {
  const path = join(dir, 'adb')
  writeFileSync(join(dir, 'adb.json'), JSON.stringify({ devices, forwards, sdk, dump, png: png?.toString('base64') }))
  if (!existsSync(path)) {
    writeFileSync(path, `#!${process.execPath}\n${PROGRAM}`)
    chmodSync(path, 0o755)
  }
  return path
}

/** The calls the fake in `dir` has answered, each as its arguments. */
export function adbCalls(dir) {
  try {
    return readFileSync(join(dir, 'adb.log'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
}

/** `adb devices` listing `serials`, each online. */
export const deviceList = (...serials) => `List of devices attached\n${serials.map(serial => `${serial}\tdevice\n`).join('')}\n`
