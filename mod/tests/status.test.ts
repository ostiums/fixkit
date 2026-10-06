import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

/** The world beneath the mod: a receiver the test drives, and the statuses the mod publishes. */
function world(on: On) {
  const receiver = receiverLines()
  const statuses: Record<string, string>[] = []
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
  on('fs.write', async (_$, e) => {
    if (e.path.endsWith('status.json')) statuses.push(JSON.parse(e.text))
    return { value: undefined }
  })
  on('tool.call', async () => ({ result: 'built and launched' }))
  on('turn.complete', async () => ({ text: '' }))

  return { receiver, statuses, submission }
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
