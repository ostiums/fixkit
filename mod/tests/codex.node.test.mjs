// node --test mod/tests/*.node.test.mjs: Codex support, from the driver's rules to a receiver
// driven through the same shell line Codex runs for each hook.
import assert from 'node:assert/strict'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

import { INSTRUCTIONS, RN_INSTRUCTIONS } from '../core/prompt.mjs'
import { codexDriver, codexQueue } from '../codex/driver.mjs'
import { appProject } from '../codex/project.mjs'
import { freePort, project, startReceiver, until } from './receiver.mjs'

const SESSION_START = new URL('../codex/session-start.mjs', import.meta.url).pathname

/** A folder tree: each key a path, a string value a file's text, null a folder. */
function tree(files) {
  const root = project()
  for (const [path, text] of Object.entries(files)) {
    if (text === null) mkdirSync(join(root, path), { recursive: true })
    else {
      mkdirSync(join(root, path, '..'), { recursive: true })
      writeFileSync(join(root, path), text)
    }
  }
  return root
}

/** Runs the SessionStart hook as Codex does: in the session's folder, its input on stdin. */
function sessionStart(cwd, session, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SESSION_START], { cwd, env: { ...process.env, ...env } })
    let out = ''
    child.stdout.on('data', chunk => (out += chunk))
    child.on('error', reject)
    child.on('exit', code => resolve({ code, out }))
    child.stdin.end(JSON.stringify({ hook_event_name: 'SessionStart', session_id: session, cwd, source: 'startup' }))
  })
}

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

test('an app project is found from a folder inside it, up to the git root', () => {
  const ios = tree({ '.git': null, 'Tally.xcodeproj': null, 'Tally/App': null })
  assert.deepEqual(appProject(join(ios, 'Tally/App')), { packageJson: null })
  assert.deepEqual(appProject(tree({ 'Package.swift': '' })), { packageJson: null })

  const rn = tree({ '.git': null, 'package.json': '{"dependencies":{"react-native":"0.81.0"}}', 'ios/App.xcodeproj': null })
  assert.match(appProject(rn).packageJson, /react-native/)
})

test('anything else is no app project', () => {
  assert.equal(appProject(tree({ '.git': null, 'package.json': '{"dependencies":{"react":"19"}}' })), null)
  assert.equal(appProject(tree({ '.git': null })), null)
  // The git root is the edge: an app above it belongs to another project.
  const outer = tree({ 'Outer.xcodeproj': null, 'inner/.git': null })
  assert.equal(appProject(join(outer, 'inner')), null)
})

test('in an app project the session starts its receiver once and gets the instructions', async t => {
  const cwd = tree({ '.git': null, 'Tally.xcodeproj': null })
  const port = await freePort()
  const url = path => `http://127.0.0.1:${port}${path}`
  const env = { FIXKIT_PORT: String(port) }
  const end = session => fetch(url('/codex/hook'), { method: 'POST', body: JSON.stringify({ hook_event_name: 'SessionEnd', session_id: session }) })

  const first = await sessionStart(cwd, 'S1', env)
  assert.equal(first.code, 0)
  assert.deepEqual(JSON.parse(first.out), {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: INSTRUCTIONS },
  })
  const answer = await until(() => fetch(url('/codex/session')).then(res => res.json(), () => null))
  t.after(() => end('S2').catch(() => {}))
  assert.deepEqual(answer, { session: 'S1' })
  const { run } = await fetch(url('/status')).then(res => res.json())

  // A resumed or compacted session keeps the receiver it has.
  await sessionStart(cwd, 'S1', env)
  assert.equal((await fetch(url('/status')).then(res => res.json())).run, run)

  // Another session in the project takes the reports over.
  await sessionStart(cwd, 'S2', env)
  await until(() => fetch(url('/codex/session')).then(res => res.json(), () => null).then(one => one?.session === 'S2'))
})

test('a React Native project gets its own instructions', async t => {
  const cwd = tree({ 'package.json': '{"dependencies":{"react-native":"0.81.0"}}' })
  const port = await freePort()
  t.after(() =>
    fetch(`http://127.0.0.1:${port}/codex/hook`, {
      method: 'POST',
      body: JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 'S' }),
    }).catch(() => {}),
  )

  const { out } = await sessionStart(cwd, 'S', { FIXKIT_PORT: String(port) })
  assert.equal(JSON.parse(out).hookSpecificOutput.additionalContext, RN_INSTRUCTIONS)
  await until(() => fetch(`http://127.0.0.1:${port}/codex/session`).then(res => res.ok, () => false))
})

const MOD = new URL('..', import.meta.url).pathname
const manifest = JSON.parse(readFileSync(join(MOD, '.codex-plugin/plugin.json'), 'utf8'))
const { hooks } = JSON.parse(readFileSync(join(MOD, 'codex/hooks.json'), 'utf8'))

test('the Codex plugin declares its hooks, only the session edges waiting on them', () => {
  assert.equal(manifest.name, 'fixkit')
  assert.equal(manifest.hooks, './codex/hooks.json')
  assert.deepEqual(Object.keys(hooks).sort(), [
    'Interrupt',
    'PostToolUse',
    'PreToolUse',
    'SessionEnd',
    'SessionStart',
    'Stop',
    'UserPromptSubmit',
  ])
  for (const [event, groups] of Object.entries(hooks)) {
    const waits = event === 'SessionStart' || event === 'SessionEnd'
    for (const group of groups) {
      for (const handler of group.hooks) assert.equal(handler.async === true, !waits, event)
      // Codex caps these two at 3 s and warns about anything longer.
      if (event === 'SessionEnd' || event === 'Interrupt') {
        for (const handler of group.hooks) assert.ok(handler.timeout <= 3, event)
      }
      assert.equal(group.matcher, event.endsWith('ToolUse') ? 'build_run_sim$' : undefined, event)
    }
  }
})

/** Runs an event's hook command the way Codex does: through a shell in the session's folder, input on stdin. */
function runHook(event, input, { cwd, port }) {
  const { command } = hooks[event][0].hooks[0]
  return new Promise(resolve => {
    const child = spawn('sh', ['-c', command], {
      cwd,
      env: { ...process.env, PLUGIN_ROOT: MOD.replace(/\/$/, ''), FIXKIT_PORT: String(port) },
    })
    child.on('exit', resolve)
    child.stdin.end(JSON.stringify({ session_id: 'S', turn_id: 'T1', cwd, hook_event_name: event, ...input }))
  })
}

test('end to end: a report is queued in Codex and its hooks walk it to live', async t => {
  const cwd = tree({ '.git': null, 'Tally.xcodeproj': null })
  const calls = join(cwd, 'codex-calls.jsonl')
  const fake = join(cwd, 'codex')
  writeFileSync(fake, `#!/usr/bin/env node\nrequire('fs').appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + '\\n')\n`)
  chmodSync(fake, 0o755)
  const receiver = await startReceiver({ args: ['--codex', 'S'], env: { FIXKIT_CODEX: fake }, cwd })
  t.after(receiver.stop)
  const status = async () => (await receiver.get('/status?id=r1')).status
  const ctx = { cwd, port: receiver.port }

  await receiver.post('/report', { comment: 'Button is shifted', screen: 'Home' })
  const [args] = await until(() => {
    try {
      return readFileSync(calls, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    } catch {
      return null
    }
  })
  assert.deepEqual(args.slice(0, 2), ['queue', '--thread=S'])
  const prompt = args[2].replace('--message=', '')
  assert.match(prompt, /^Button is shifted\n\n\[fix r1\] Home screen$/)
  assert.equal(await status(), 'queued')

  assert.equal(await runHook('UserPromptSubmit', { prompt }, ctx), 0)
  assert.equal(await status(), 'fixing')
  await runHook('PreToolUse', { tool_name: BUILD }, ctx)
  assert.equal(await status(), 'rebuilding')
  assert.equal((await receiver.post('/launched', {})).id, 'r1')
  await runHook('PostToolUse', { tool_name: BUILD }, ctx)
  await runHook('Stop', {}, ctx)
  assert.equal(await status(), 'live')

  assert.equal(await runHook('SessionEnd', { reason: 'exit' }, ctx), 0)
  await receiver.exited
})

test('the end of the session is answered before the receiver goes', async () => {
  const receiver = await startReceiver({ args: ['--codex', 'S'] })

  assert.deepEqual(await receiver.post('/codex/hook', { hook_event_name: 'SessionEnd', session_id: 'S' }), {})
  await receiver.exited
})

test('a hook with no receiver to talk to still succeeds', async () => {
  const cwd = tree({ '.fixkit': null })
  assert.equal(await runHook('Stop', {}, { cwd, port: await freePort() }), 0)
})

test('outside an app project the session gets nothing and nothing starts', async () => {
  const port = await freePort()
  const { code, out } = await sessionStart(tree({ '.git': null }), 'S', { FIXKIT_PORT: String(port) })

  assert.equal(code, 0)
  assert.equal(out, '')
  await new Promise(resolve => setTimeout(resolve, 300))
  await assert.rejects(fetch(`http://127.0.0.1:${port}/status`))
})
