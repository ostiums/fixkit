// node --test mod/tests/*.node.test.mjs: the receiver as a process, with Swift and React Native reports.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { startReceiver, until } from './receiver.mjs'

/** The receiver in a folder of its own on a free port, with its stdout as JSON events. */
async function receiver() {
  const cwd = mkdtempSync(join(tmpdir(), 'fixkit-'))
  const child = spawn(process.execPath, [new URL('../server/receiver.mjs', import.meta.url).pathname], {
    cwd,
    // No AXe on this PATH or in this HOME's npx cache, so the lookup answers at once.
    env: { ...process.env, FIXKIT_PORT: '0', PATH: '/usr/bin:/bin', HOME: cwd },
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
async function deliver(sent, before = async () => {}) {
  const { base, events, until, stop } = await receiver()
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

  assert.deepEqual(await receiver.post('/report', { comment: 'Shifted', screen: 'Home', simulator: 'NO-SUCH-SIMULATOR' }), { id: 'r1' })
  const report = await until(() => receiver.lines.find(line => line.type === 'report'))
  assert.equal(report.report.id, 'r1')
  assert.equal(report.report.comment, 'Shifted')

  assert.equal((await receiver.get('/status?id=r1')).status, 'queued')
  writeFileSync(join(receiver.cwd, '.fixkit', 'status.json'), JSON.stringify({ r1: 'fixing' }))
  assert.equal((await receiver.get('/status?id=r1')).status, 'fixing')

  const launched = await receiver.post('/launched', {})
  assert.equal(launched.id, 'r1')
  await until(() => receiver.lines.some(line => line.type === 'launched'))
})

test('with --codex the receiver serves its Codex session and prints nothing', async t => {
  const receiver = await startReceiver({ args: ['--codex', 'S1'] })
  t.after(receiver.stop)

  assert.deepEqual(await receiver.get('/codex/session'), { session: 'S1' })
  assert.deepEqual(receiver.lines, [])
})
