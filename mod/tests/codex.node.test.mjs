// node --test mod/tests/*.node.test.mjs: Codex support, from the driver's rules to a receiver
// driven through the same shell line Codex runs for each hook.
import assert from 'node:assert/strict'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { codexDriver, codexQueue } from '../codex/driver.mjs'
import { project } from './receiver.mjs'

const BUILD = 'mcp__XcodeBuildMCP__build_run_sim'
const settle = () => new Promise(resolve => setTimeout(resolve, 10))

/** A driver for session S in /p, with `codex queue` and the receiver's exit recorded. */
function codex({ queue } = {}) {
  const queued = []
  const left = []
  const logged = []
  const driver = codexDriver({
    session: 'S',
    cwd: '/p',
    leave: message => left.push(message),
    log: message => logged.push(message),
    queue: queue ?? (async (session, prompt) => void queued.push({ session, prompt })),
  })
  const status = id => driver.statuses()[id]
  return { driver, queued, left, logged, status }
}

/** A hook's input as Codex writes it, for session S and turn T1 unless said otherwise. */
const hook = (event, fields = {}) => ({ hook_event_name: event, session_id: 'S', turn_id: 'T1', cwd: '/p', ...fields })

const report = (id = 'r1', fields = {}) => ({
  type: 'report',
  report: {
    id,
    comment: 'Shifted',
    screen: 'Home',
    screenshot: `.fixkit/reports/${id}.png`,
    element: { name: 'home.send', file: '/p/App/Home.swift', line: 8 },
    ...fields,
  },
})

/** Starts report `id`'s turn the way Codex does: its queued prompt submitted as a user prompt. */
async function start(codex, id = 'r1', turn = 'T1') {
  codex.driver.emit(report(id))
  await settle()
  const { prompt } = codex.queued.find(one => one.prompt.includes(`[fix ${id}]`))
  codex.driver.hook(hook('UserPromptSubmit', { prompt, turn_id: turn }))
}

test('a report is queued in the session with its prompt, sources relative to the project', async () => {
  const fix = codex()
  fix.driver.emit(report())
  assert.equal(fix.status('r1'), 'queued')
  await settle()

  assert.deepEqual(fix.queued, [
    { session: 'S', prompt: 'Shifted\n\n[fix r1] home.send · App/Home.swift:8 · .fixkit/reports/r1.png' },
  ])
})

test('the turn that carries the report walks it to live', async () => {
  const fix = codex()
  await start(fix)
  assert.equal(fix.status('r1'), 'fixing')

  fix.driver.hook(hook('PreToolUse', { tool_name: BUILD }))
  assert.equal(fix.status('r1'), 'rebuilding')
  fix.driver.emit({ type: 'launched' })
  assert.equal(fix.status('r1'), 'live')
  fix.driver.hook(hook('PostToolUse', { tool_name: BUILD }))
  fix.driver.hook(hook('Stop'))

  assert.equal(fix.status('r1'), 'live')
})

test('a build that launched nothing leaves the report fixing, and its turn ends it stopped', async () => {
  const fix = codex()
  await start(fix)
  fix.driver.hook(hook('PreToolUse', { tool_name: BUILD }))
  fix.driver.hook(hook('PostToolUse', { tool_name: BUILD }))
  assert.equal(fix.status('r1'), 'fixing')

  fix.driver.hook(hook('Stop'))
  assert.equal(fix.status('r1'), 'stopped')
})

test('an interrupted turn is stopped even after a launch', async () => {
  const fix = codex()
  await start(fix)
  fix.driver.emit({ type: 'launched' })
  fix.driver.hook(hook('Interrupt'))

  assert.equal(fix.status('r1'), 'stopped')
})

test('another session, a subagent and another turn move nothing', async () => {
  const fix = codex()
  await start(fix)
  fix.driver.hook(hook('PreToolUse', { tool_name: BUILD, session_id: 'other' }))
  fix.driver.hook(hook('PreToolUse', { tool_name: BUILD, agent_id: 'sub' }))
  fix.driver.hook(hook('PreToolUse', { tool_name: BUILD, turn_id: 'T0' }))
  fix.driver.hook(hook('Stop', { session_id: 'other' }))
  fix.driver.hook(hook('Stop', { turn_id: 'T0' }))
  fix.driver.hook(hook('PreToolUse', { tool_name: 'shell' }))

  assert.equal(fix.status('r1'), 'fixing')
})

test("a person's own prompt is no fix turn, and closes one that never got its Stop", async () => {
  const fix = codex()
  await start(fix)
  fix.driver.hook(hook('UserPromptSubmit', { prompt: 'what changed?', turn_id: 'T2' }))
  assert.equal(fix.status('r1'), 'stopped')

  fix.driver.emit({ type: 'launched' })
  fix.driver.hook(hook('Stop', { turn_id: 'T2' }))
  assert.equal(fix.status('r1'), 'stopped')
})

test('statuses stay in the order the reports came, which the receiver answers a launch by', async () => {
  const fix = codex()
  fix.driver.emit(report('r1'))
  fix.driver.emit(report('r2'))
  await settle()
  fix.driver.hook(hook('UserPromptSubmit', { prompt: fix.queued[0].prompt }))

  assert.deepEqual(Object.keys(fix.driver.statuses()), ['r1', 'r2'])
})

test('a prompt naming a report this receiver never had starts nothing', async () => {
  const fix = codex()
  fix.driver.hook(hook('UserPromptSubmit', { prompt: 'Old\n\n[fix r9] home.send' }))
  fix.driver.emit({ type: 'launched' })

  assert.deepEqual(fix.driver.statuses(), {})
})

test('a report Codex would not queue is stopped, and the reason is logged', async () => {
  const fix = codex({ queue: async () => Promise.reject(new Error('--no-daemon cannot be used with codex queue')) })
  fix.driver.emit(report())
  await settle()

  assert.equal(fix.status('r1'), 'stopped')
  assert.match(fix.logged.join('\n'), /no-daemon/)
})

test('reports are queued one at a time, in the order they came', async () => {
  const order = []
  let release
  const first = new Promise(resolve => (release = resolve))
  const fix = codex({
    queue: async (_session, prompt) => {
      if (prompt.includes('[fix r1]')) await first
      order.push(prompt.match(/\[fix (r\d+)\]/)[1])
    },
  })
  fix.driver.emit(report('r1'))
  fix.driver.emit(report('r2'))
  await settle()
  assert.deepEqual(order, [])

  release()
  await settle()
  assert.deepEqual(order, ['r1', 'r2'])
})

test('the end of its own session closes the receiver, another session’s does not', () => {
  const fix = codex()
  fix.driver.hook(hook('SessionEnd', { session_id: 'other' }))
  assert.deepEqual(fix.left, [])

  fix.driver.hook(hook('SessionEnd'))
  assert.equal(fix.left.length, 1)
})

test('codex queue gets the session and the message as one argument each, whatever they hold', async t => {
  const dir = project()
  const fake = join(dir, 'codex')
  const out = join(dir, 'argv.json')
  writeFileSync(fake, `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)))\n`)
  chmodSync(fake, 0o755)
  process.env.FIXKIT_CODEX = fake
  t.after(() => delete process.env.FIXKIT_CODEX)

  await codexQueue('S', '-v is "wrong"\n\n[fix r1] home.send')

  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), [
    'queue',
    '--thread=S',
    '--message=-v is "wrong"\n\n[fix r1] home.send',
  ])
})
