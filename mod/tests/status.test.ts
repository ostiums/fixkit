import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { FLUTTER_INSTRUCTIONS, HOT_RELOAD_TOOL, INSTRUCTIONS, RN_INSTRUCTIONS } from '../hooks/prompt'

// The test runner has timers; the hooks module's own environment, typed here, does not.
declare function setTimeout(callback: () => void, ms: number): unknown

/** The receiver's stdout as the test writes it, one JSON line per event. */
function receiverLines() {
  const waiting: ((line: string | null) => void)[] = []
  const queued: (string | null)[] = []
  const take = () =>
    new Promise<string | null>(resolve => (queued.length > 0 ? resolve(queued.shift() ?? null) : waiting.push(resolve)))

  return {
    send(event: object) {
      const line = JSON.stringify(event) + '\n'
      const next = waiting.shift()
      next ? next(line) : queued.push(line)
    },
    async *stream() {
      for (let line = await take(); line !== null; line = await take()) {
        yield { stream: 'stdout' as const, text: line }
      }
      return { value: { code: 0, signal: null } }
    },
  }
}

/**
 * The world beneath the mod: a receiver the test drives, the project's `files`, the statuses the mod
 * publishes, the tools it registers and what it fetches.
 */
function world(on: On, files: Record<string, string> = {}) {
  const receiver = receiverLines()
  const statuses: Record<string, string>[] = []
  const registered: string[] = []
  const fetched: { url: string; body: string | undefined }[] = []
  let reloadAnswer = JSON.stringify({ ok: true })
  let submitted: () => void = () => {}
  const submission = new Promise<void>(resolve => (submitted = resolve))

  mock.clock(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', async () => ({ value: undefined }))
  on('ui.log', async () => ({ value: undefined }))
  on('process.spawn', async function* () {
    return yield* receiver.stream()
  })
  on('prompt.submit', async (_$, e) => {
    submitted()
    return { text: e.text }
  })
  // The mod reads the project's files by their names in the working directory.
  on('fs.read', async (_$, e) => {
    const text = files[e.path.split('/').pop() ?? e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('tool.register', async (_$, e) => {
    registered.push(e.name)
    return { value: { tool: `mcp__fixkit__${e.name}` } }
  })
  on('http.fetch', async (_$, e) => {
    fetched.push({ url: e.url, body: e.init?.body })
    return { value: { status: 200, ok: true, headers: {}, text: reloadAnswer } }
  })
  on('fs.write', async (_$, e) => {
    if (e.path.endsWith('status.json')) statuses.push(JSON.parse(e.text))
    return { value: undefined }
  })
  on('tool.call', async () => ({ result: 'built and launched' }))
  on('turn.complete', async () => ({ text: '' }))

  return { receiver, statuses, submission, registered, fetched, answerReload: (text: string) => (reloadAnswer = text) }
}

/** Waits until the mod has done what a receiver line asked for. */
async function until(done: () => boolean) {
  for (let waited = 0; !done(); waited += 5) {
    if (waited > 2000) throw new Error('the mod never got there')
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }
}

const turnEnd = { answer: 'Fixed.', durationMs: 1, isAborted: false, turnId: 't1' } as const
const report = { type: 'report', report: { id: 'r1', comment: 'Income should be green', screen: 'Activity', screenshot: null } }

test('a launch during the fix makes the report live, and an answer keeps it live', async ($, on) => {
  const { receiver, statuses, submission } = world(on)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  receiver.send({ type: 'ready', port: 4747 })
  receiver.send(report)
  await submission
  await until(() => statuses.at(-1)?.r1 === 'fixing')

  await $.tool.call({ tool: 'mcp__XcodeBuildMCP__build_run_sim' })
  receiver.send({ type: 'launched' })
  await until(() => statuses.at(-1)?.r1 === 'live')
  await $.turn.complete({ ...turnEnd, reason: 'answer' })

  expect(statuses.map(all => all.r1)).toEqual(['queued', 'fixing', 'rebuilding', 'live', 'live'])
})

test('without a launch the fix is not on screen', async ($, on) => {
  const { receiver, statuses, submission } = world(on)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  receiver.send(report)
  await submission
  await until(() => statuses.at(-1)?.r1 === 'fixing')

  await $.turn.complete({ ...turnEnd, reason: 'answer' })

  expect(statuses.at(-1)?.r1).toBe('stopped')
})

/** The facts of one prompt being composed. */
const composing = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const

test('a React Native project gets the React Native instructions', async ($, on) => {
  const app = JSON.stringify({ dependencies: { 'react-native': '0.86.3' } })
  world(on, { 'package.json': app })
  on('prompt.compose', async () => ({ sections: [] }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  const { sections } = await $.prompt.compose(composing)

  expect(sections.find(section => section.id === 'fixkit:fix-requests')?.text).toBe(RN_INSTRUCTIONS)
})

test('without a package.json the instructions are the iOS ones', async ($, on) => {
  world(on)
  on('prompt.compose', async () => ({ sections: [] }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  const { sections } = await $.prompt.compose(composing)

  expect(sections.find(section => section.id === 'fixkit:fix-requests')?.text).toBe(INSTRUCTIONS)
})

const pubspec = 'name: wallet\ndependencies:\n  flutter:\n    sdk: flutter\n'

test('a Flutter project gets the Flutter instructions and the hot_reload tool', async ($, on) => {
  const { registered } = world(on, { 'pubspec.yaml': pubspec })
  on('prompt.compose', async () => ({ sections: [] }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  const { sections } = await $.prompt.compose(composing)

  expect(sections.find(section => section.id === 'fixkit:fix-requests')?.text).toBe(FLUTTER_INSTRUCTIONS)
  expect(registered).toEqual(['hot_reload'])
})

test('a native project registers no tool', async ($, on) => {
  const { registered } = world(on)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })

  expect(registered).toEqual([])
})

test('hot_reload asks the receiver, and the reload it causes makes the fix live', async ($, on) => {
  const { receiver, statuses, submission, fetched } = world(on, { 'pubspec.yaml': pubspec })
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  receiver.send({ type: 'ready', port: 4757 })
  receiver.send(report)
  await submission
  await until(() => statuses.at(-1)?.r1 === 'fixing')

  const { result } = await $.tool.call({ tool: HOT_RELOAD_TOOL, restart: true })
  receiver.send({ type: 'launched' })
  await until(() => statuses.at(-1)?.r1 === 'live')

  expect(fetched).toEqual([{ url: 'http://127.0.0.1:4757/reload', body: JSON.stringify({ restart: true }) }])
  expect(String(result)).toContain('Restarted')
  expect(statuses.map(all => all.r1)).toEqual(['queued', 'fixing', 'rebuilding', 'live'])
})

test("a failed reload is the tool's error, and the report goes back to fixing", async ($, on) => {
  const { receiver, statuses, submission, answerReload } = world(on, { 'pubspec.yaml': pubspec })
  answerReload(JSON.stringify({ ok: false, error: 'The reload failed, most likely a compile error: run dart analyze on the changed files' }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  receiver.send({ type: 'ready', port: 4757 })
  receiver.send(report)
  await submission
  await until(() => statuses.at(-1)?.r1 === 'fixing')

  const result = await $.tool.call({ tool: HOT_RELOAD_TOOL })

  expect(result.isError).toBe(true)
  expect(result.text).toContain('dart analyze')
  expect(statuses.at(-1)?.r1).toBe('fixing')
})
