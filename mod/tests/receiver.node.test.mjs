// node --test mod/tests/*.node.test.mjs: the receiver as a process, with Swift and React Native reports.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { NO_APP, NOT_RUNNING } from '../server/flutter.mjs'
import { adbCalls, deviceList, fakeAdb, restartAdbServer } from './fake-adb.mjs'
import { startReceiver, until } from './receiver.mjs'

/** The receiver in a folder of its own on a free port, with its stdout as JSON events; `adb` is a fake one. */
async function receiver(adb = null) {
  const cwd = mkdtempSync(join(tmpdir(), 'fixkit-'))
  const child = spawn(process.execPath, [new URL('../server/receiver.mjs', import.meta.url).pathname], {
    cwd,
    // No AXe on this PATH or in this HOME's npx cache, so the lookup answers at once; no adb but the fake.
    env: { ...process.env, FIXKIT_PORT: '0', PATH: '/usr/bin:/bin', HOME: cwd, FIXKIT_ADB: adb ?? join(cwd, 'no-adb') },
  })
  const events = []
  let pending = ''
  child.stdout.on('data', chunk => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop()
    events.push(...lines.filter(Boolean).map(line => JSON.parse(line)))
  })
  const until = async done => {
    for (let waited = 0; !done(); waited += 20) {
      if (waited > 5000) throw new Error(`no event: ${JSON.stringify(events)}`)
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  await until(() => events.some(event => event.type === 'ready'))
  const { port } = events.find(event => event.type === 'ready')
  return { base: `http://127.0.0.1:${port}`, events, until, stop: () => child.kill() }
}

/** Posts a report to a fresh receiver, after `before(base)`, and returns the one it emits. */
async function deliver(sent, before = async () => {}, adb = null) {
  const { base, events, until, stop } = await receiver(adb)
  try {
    await before(base)
    const answer = await fetch(`${base}/report`, { method: 'POST', body: JSON.stringify(sent) })
    assert.equal((await answer.json()).id, 'r1')
    await until(() => events.some(event => event.type === 'report'))
    return events.find(event => event.type === 'report').report
  } finally {
    stop()
  }
}

const rnReport = fields => ({
  os: '27.0',
  comment: 'The name is cut off',
  screen: '',
  touch: { x: 100, y: 310 },
  simulator: 'NO-SUCH-SIMULATOR',
  ...fields,
})

test('a Swift report goes through as before: its own simulator and screenshot, no sources', async () => {
  const sent = {
    comment: 'Make it bold',
    screen: 'Home',
    touch: { x: 10, y: 20 },
    simulator: 'SWIFT-UDID',
    element: { name: 'card.name', file: '/p/Card.swift', line: 7, frame: { x: 0, y: 0, width: 1, height: 1 } },
    screenshotPNG: Buffer.from('png').toString('base64'),
  }
  const report = await deliver(sent)

  assert.equal(report.simulator, 'SWIFT-UDID')
  assert.equal(report.screenshot, join('.fixkit', 'reports', 'r1.png'))
  assert.deepEqual(report.element, sent.element)
  assert.equal('screenshotPNG' in report, false)
})

test("a React Native report's stacks stay in the receiver; without Metro its element keeps no source", async () => {
  const element = { name: 'WalletCard › Text', frame: { x: 44, y: 299, width: 314, height: 22 } }
  const report = await deliver(
    rnReport({ element, stacks: ['Error: react-stack-top-frame\n    at WalletCard (http://127.0.0.1:9/index.bundle:10:5)'] }),
  )

  assert.equal('stacks' in report, false)
  assert.equal(report.screenshot, null)
  assert.deepEqual(report.element, element)
})

test('a React Native app that sends a stack at launch gets its stacks read from the map of that bundle', async () => {
  // A stand-in for Metro: the map of the bundle the app launched with, and a /symbolicate that has
  // moved on since, as it does after a Fast Refresh.
  const metro = createServer((req, res) => {
    if (req.url.startsWith('/kept.map')) {
      res.end(JSON.stringify({ version: 3, sources: ['/app/src/Card.tsx'], names: [], mappings: 'AAAA;AACA' }))
    } else {
      res.writeHead(500).end()
    }
  })
  await new Promise(resolve => metro.listen(0, '127.0.0.1', resolve))
  const bundle = `http://127.0.0.1:${metro.address().port}/kept.bundle?platform=ios`
  try {
    const report = await deliver(
      rnReport({
        element: { name: 'Card › Text', frame: { x: 0, y: 0, width: 10, height: 10 } },
        stacks: [`Error: react-stack-top-frame\n    at Card (${bundle}:2:4)`],
      }),
      base => fetch(`${base}/launched`, { method: 'POST', body: JSON.stringify({ stack: `Error\n    at FixKitHost (${bundle}:1:1)` }) }),
    )

    assert.equal(report.element.file, '/app/src/Card.tsx')
    assert.equal(report.element.line, 2)
  } finally {
    metro.close()
  }
})

// The receiver as each harness drives it: stdout for Claude Code, a driver of its own for Codex.

test('a report comes out on stdout, and statuses come from the file the mod writes', async t => {
  const receiver = await startReceiver()
  t.after(receiver.stop)

  assert.deepEqual(await receiver.post('/report', { comment: 'Shifted', screen: 'Home', simulator: 'NO-SUCH-SIMULATOR' }), { id: 'r1', agent: 'Claude Code' })
  const report = await until(() => receiver.lines.find(line => line.type === 'report'))
  assert.equal(report.report.id, 'r1')
  assert.equal(report.report.comment, 'Shifted')

  const status = await receiver.get('/status?id=r1')
  assert.equal(status.status, 'queued')
  assert.equal(status.agent, 'Claude Code')
  writeFileSync(join(receiver.cwd, '.fixkit', 'status.json'), JSON.stringify({ r1: 'fixing' }))
  assert.equal((await receiver.get('/status?id=r1')).status, 'fixing')

  const launched = await receiver.post('/launched', {})
  assert.equal(launched.id, 'r1')
  assert.equal(launched.agent, 'Claude Code')
  await until(() => receiver.lines.some(line => line.type === 'launched'))
})

test('with --codex the receiver serves its Codex session and prints nothing', async t => {
  const receiver = await startReceiver({ args: ['--codex', 'S1'] })
  t.after(receiver.stop)

  assert.deepEqual(await receiver.get('/codex/session'), { session: 'S1' })
  assert.equal((await receiver.get('/status')).agent, 'Codex')
  assert.deepEqual(receiver.lines, [])
})

test('a reload before any Flutter app launched says so', async t => {
  const receiver = await startReceiver()
  t.after(receiver.stop)

  assert.deepEqual(await receiver.post('/reload', {}), { ok: false, error: NO_APP })
})

test('a reload goes to the VM service the Flutter app sent at launch', async t => {
  // The app's VM service is gone, so the receiver finds the app not running.
  const receiver = await startReceiver()
  t.after(receiver.stop)

  await receiver.post('/launched', { vmService: 'http://127.0.0.1:9/x=/' })
  assert.deepEqual(await receiver.post('/reload', { restart: true }), { ok: false, error: NOT_RUNNING })
})

// Android, through a fake adb.

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
const adbFolder = () => mkdtempSync(join(tmpdir(), 'fixkit-adb-'))
// A text at 0,20 to 100,40 in the app's units, at a pixel ratio of 2.
const NAME_DUMP =
  '<?xml version="1.0" ?><hierarchy rotation="0"><node class="android.widget.FrameLayout" text="" content-desc="" resource-id="" bounds="[0,0][1080,2400]">' +
  '<node class="android.widget.TextView" text="Alex Morgan" content-desc="" resource-id="" bounds="[0,40][200,80]" /></node></hierarchy>'
const androidReport = fields => ({
  platform: 'android',
  os: '36',
  pixelRatio: 2,
  comment: 'The name is cut off',
  screen: '',
  touch: { x: 20, y: 30 },
  ...fields,
})
const reversed = (dir, serial) => adbCalls(dir).filter(args => args[1] === serial && args[2] === 'reverse' && args[3] !== '--list')

test('the receiver keeps its port reversed on every Android device, one that comes later too', async t => {
  const dir = adbFolder()
  const adb = fakeAdb(dir, { devices: deviceList('emulator-5554') })
  const receiver = await startReceiver({ env: { FIXKIT_ADB: adb } })
  t.after(receiver.stop)

  await until(() => reversed(dir, 'emulator-5554').length > 0, 'the first reverse')
  assert.deepEqual(reversed(dir, 'emulator-5554')[0].slice(2), ['reverse', `tcp:${receiver.port}`, `tcp:${receiver.port}`])

  fakeAdb(dir, { devices: deviceList('emulator-5554', 'emulator-5556') })
  for (let waited = 0; reversed(dir, 'emulator-5556').length === 0; waited += 100) {
    if (waited > 6000) assert.fail('the second device was never reversed')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(reversed(dir, 'emulator-5554').length, 1)
})

test('a restart of the adb server, which drops every reverse, gets the port reversed again', async t => {
  const dir = adbFolder()
  const adb = fakeAdb(dir, { devices: deviceList('emulator-5554') })
  const receiver = await startReceiver({ env: { FIXKIT_ADB: adb } })
  t.after(receiver.stop)
  await until(() => reversed(dir, 'emulator-5554').length === 1, 'the first reverse')

  restartAdbServer(dir)
  for (let waited = 0; reversed(dir, 'emulator-5554').length < 2; waited += 100) {
    if (waited > 6000) assert.fail('the port was never reversed again')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
})

test("an Android report gets its device's screenshot and what accessibility says, in the app's units", async () => {
  const dir = adbFolder()
  const adb = fakeAdb(dir, { devices: deviceList('emulator-5554'), dump: NAME_DUMP, png: PNG })
  const report = await deliver(androidReport(), undefined, adb)

  assert.equal(report.device, 'emulator-5554')
  assert.equal(report.screenshot, join('.fixkit', 'reports', 'r1.png'))
  assert.equal(report.accessibility.element.label, 'Alex Morgan')
})

test('a dump that fails leaves the Android report its screenshot', async () => {
  const dir = adbFolder()
  const adb = fakeAdb(dir, { devices: deviceList('emulator-5554'), dump: null, png: PNG })
  const report = await deliver(androidReport(), undefined, adb)

  assert.equal(report.accessibility, null)
  assert.equal(report.screenshot, join('.fixkit', 'reports', 'r1.png'))
})

test('two Android devices on one API level: no screenshot, and the advice once', async t => {
  const dir = adbFolder()
  const adb = fakeAdb(dir, {
    devices: deviceList('emulator-5554', 'emulator-5556'),
    sdk: { 'emulator-5554': '36', 'emulator-5556': '36' },
    png: PNG,
  })
  const { base, events, until: untilEvent, stop } = await receiver(adb)
  t.after(stop)

  for (const id of ['r1', 'r2']) {
    const answer = await fetch(`${base}/report`, { method: 'POST', body: JSON.stringify(androidReport()) })
    assert.equal((await answer.json()).id, id)
  }
  await untilEvent(() => events.filter(event => event.type === 'report').length === 2)

  assert.equal(events.find(event => event.type === 'report').report.screenshot, null)
  const notices = events.filter(event => event.type === 'notice' && event.message.includes('per API level'))
  assert.equal(notices.length, 1)
  // A Flutter app sends no API level: per level is not enough for it.
  assert.match(notices[0].message, /one at a time for Flutter/)
})

test('an iOS report never asks adb for a screenshot or the screen', async () => {
  const dir = adbFolder()
  const adb = fakeAdb(dir, { devices: deviceList('emulator-5554'), dump: NAME_DUMP, png: PNG })
  await deliver(rnReport({}), undefined, adb)

  const asked = adbCalls(dir).map(args => args.join(' '))
  assert.ok(!asked.some(call => call.includes('screencap') || call.includes('uiautomator')))
})

test("a reload of a Flutter app on Android without its port forwarded finds it not running", async t => {
  const dir = adbFolder()
  const adb = fakeAdb(dir, { devices: deviceList('emulator-5554'), forwards: '' })
  const receiver = await startReceiver({ env: { FIXKIT_ADB: adb } })
  t.after(receiver.stop)

  await receiver.post('/launched', { vmService: 'http://127.0.0.1:43123/x=/', platform: 'android' })
  assert.deepEqual(await receiver.post('/reload', {}), { ok: false, error: NOT_RUNNING })
})
