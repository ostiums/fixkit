// node --test mod/tests/*.node.test.mjs: which simulator a React Native report came from, and the
// receiver handling Swift and React Native reports.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { pickSimulator } from '../server/simulator.mjs'

const device = (udid, state = 'Booted') => ({ udid, state, name: udid })
const list = devices => ({ devices })

test('the one simulator booted on the app’s iOS version', () => {
  const found = pickSimulator(
    list({
      'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [device('A'), device('B', 'Shutdown')],
      'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [device('C')],
    }),
    '27.0',
  )

  assert.deepEqual(found, { udid: 'A', booted: 1 })
})

test('a patch version names its runtime by major and minor', () => {
  const found = pickSimulator(list({ 'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [device('A')] }), '18.0.1')

  assert.equal(found.udid, 'A')
})

test('two booted on the same version leave it unknown', () => {
  const found = pickSimulator(list({ 'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [device('A'), device('B')] }), '27.0')

  assert.deepEqual(found, { udid: null, booted: 2 })
})

test('without a version, the only booted simulator', () => {
  assert.equal(pickSimulator(list({ 'x.iOS-27-0': [device('A')], 'x.iOS-26-5': [] })).udid, 'A')
  assert.equal(pickSimulator(list({})).udid, null)
})

/** The receiver in a folder of its own on `port`, with its stdout as JSON events. */
async function receiver(port) {
  const cwd = mkdtempSync(join(tmpdir(), 'fixkit-'))
  const child = spawn(process.execPath, [new URL('../server/receiver.mjs', import.meta.url).pathname], {
    cwd,
    // No AXe on this PATH or in this HOME's npx cache, so the lookup answers at once.
    env: { ...process.env, FIXKIT_PORT: String(port), PATH: '/usr/bin:/bin', HOME: cwd },
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
  return { events, until, stop: () => child.kill() }
}

/** Posts a report to the receiver and returns the one it emits. */
async function deliver(sent) {
  const port = 47_000 + Math.floor(Math.random() * 1000)
  const { events, until, stop } = await receiver(port)
  try {
    const answer = await fetch(`http://127.0.0.1:${port}/report`, { method: 'POST', body: JSON.stringify(sent) })
    assert.equal((await answer.json()).id, 'r1')
    await until(() => events.some(event => event.type === 'report'))
    return events.find(event => event.type === 'report').report
  } finally {
    stop()
  }
}

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
  const report = await deliver({
    platform: 'react-native',
    os: '27.0',
    comment: 'The name is cut off',
    screen: '',
    touch: { x: 100, y: 310 },
    simulator: 'NO-SUCH-SIMULATOR',
    element,
    stacks: ['Error: react-stack-top-frame\n    at WalletCard (http://127.0.0.1:9/index.bundle:10:5)'],
  })

  assert.equal('stacks' in report, false)
  assert.equal(report.screenshot, null)
  assert.deepEqual(report.element, element)
  assert.equal(report.platform, 'react-native')
})

test('a React Native app that names its bundle at launch gets its stacks read from the map of that bundle', async () => {
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
  const port = 47_000 + Math.floor(Math.random() * 1000)
  const { events, until, stop } = await receiver(port)
  try {
    await fetch(`http://127.0.0.1:${port}/launched`, { method: 'POST', body: JSON.stringify({ bundle }) })
    await new Promise(resolve => setTimeout(resolve, 300))
    const sent = {
      platform: 'react-native',
      os: '27.0',
      comment: 'Too small',
      screen: '',
      touch: { x: 1, y: 2 },
      simulator: 'NO-SUCH-SIMULATOR',
      element: { name: 'Card › Text', frame: { x: 0, y: 0, width: 10, height: 10 } },
      stacks: [`Error: react-stack-top-frame\n    at Card (${bundle}:2:4)`],
    }
    await fetch(`http://127.0.0.1:${port}/report`, { method: 'POST', body: JSON.stringify(sent) })
    await until(() => events.some(event => event.type === 'report'))

    const { report } = events.find(event => event.type === 'report')
    assert.equal(report.element.file, '/app/src/Card.tsx')
    assert.equal(report.element.line, 2)
  } finally {
    stop()
    metro.close()
  }
})
