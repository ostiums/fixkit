import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FixReport, FixStatus, Incoming, Receiver } from '../types'
import { INSTRUCTIONS, isBuildAndRun, pressedLabel, promptFor } from './prompt'

const PANE = 'fix-queue'
const TITLE = 'Fix queue'
const STATUS_FILE = '.fixkit/status.json'

const reports = atom({ plugin: 'fixkit', key: 'reports' } as const, [])
const receiver = atom({ plugin: 'fixkit', key: 'receiver' } as const, {
  state: 'starting',
  detail: '',
})
const now = atom({ plugin: 'fixkit', key: 'now' } as const, 0)

type ReceiverEvent =
  | { type: 'ready'; port: number }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string }
  | { type: 'launched' }
  | { type: 'report'; report: Incoming }

const LOOK: Record<FixStatus, { mark: string; label: string; color: string }> = {
  queued: { mark: '○', label: 'queued', color: 'yellow' },
  fixing: { mark: '◆', label: 'fixing', color: 'cyan' },
  rebuilding: { mark: '▲', label: 'rebuilding', color: 'magenta' },
  live: { mark: '✔', label: 'live', color: 'green' },
  stopped: { mark: '✘', label: 'not rebuilt', color: 'red' },
}

const isActive = (report: FixReport) => report.status !== 'live' && report.status !== 'stopped'

let cwd = ''
// The report whose turn is running; its prompt was submitted by this mod.
let current: string | null = null

function relative(path: string) {
  return cwd && path.startsWith(cwd + '/') ? path.slice(cwd.length + 1) : path
}

/** Changes one report, then publishes every status for the app to poll. */
async function patch($: EngineInterface, id: string, change: (report: FixReport) => FixReport) {
  const list = await update($, reports, all => all.map(one => (one.id === id ? change(one) : one)))
  const statuses = Object.fromEntries(list.map(one => [one.id, one.status]))
  await $.fs.write(STATUS_FILE, JSON.stringify(statuses))
}

async function accept($: EngineInterface, incoming: Incoming) {
  const { file, line } = incoming.element ?? {}
  const source = file && line ? `${relative(file)}:${line}` : null
  const report: FixReport = {
    id: incoming.id,
    comment: incoming.comment,
    element: incoming.element?.name ?? null,
    accessibility: incoming.accessibility ?? null,
    viewDescription: incoming.viewDescription ?? null,
    source,
    screen: incoming.screen,
    screenshot: incoming.screenshot,
    status: 'queued',
    receivedAt: await $.clock.now(),
    finishedAt: null,
    edited: [],
  }
  await update($, reports, all => [...all, report].slice(-50))
  await patch($, report.id, one => one)
  $.ui.toast(`Fix request ${report.id}: ${report.comment}`)

  // Resolves when the report's own turn starts, after any turn already running.
  // As the person's own words: they typed the comment, and the engine adds no frame around it.
  await $.prompt.submit({ text: promptFor(incoming, source), asUser: true })
  current = report.id
  await patch($, report.id, one => ({ ...one, status: 'fixing' }))
}

/** The app launched while Claude works on a report: whatever built it, the fix is on screen. */
async function launched($: EngineInterface) {
  if (current !== null) {
    await patch($, current, one => ({ ...one, status: 'live' }))
  }
}

async function listen($: EngineInterface) {
  await update($, receiver, (): Receiver => ({ state: 'starting', detail: '' }))
  const child = $.process.spawn({ argv: ['node', `${$.plugin.root}/server/receiver.mjs`] })
  let pending = ''

  try {
    for await (const { stream, text } of child) {
      if (stream === 'stderr') {
        $.ui.log(text, { to: 'debug' })
        continue
      }
      pending += text
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''

      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line) as ReceiverEvent
        if (event.type === 'ready') {
          await update($, receiver, (): Receiver => ({ state: 'listening', detail: `127.0.0.1:${event.port}` }))
        } else if (event.type === 'error') {
          await update($, receiver, (): Receiver => ({ state: 'failed', detail: event.message }))
          $.ui.toast(`fixkit: ${event.message}`)
        } else if (event.type === 'notice') {
          await update($, receiver, (was): Receiver => ({ ...was, notice: event.message }))
        } else if (event.type === 'launched') {
          void launched($)
        } else {
          void accept($, event.report)
        }
      }
    }
  } catch (error) {
    await update($, receiver, (): Receiver => ({ state: 'failed', detail: String(error) }))
    return
  }

  // The child has exited. Say so, unless it already reported why.
  await update($, receiver, (was): Receiver =>
    was.state === 'failed' ? was : { state: 'failed', detail: 'receiver stopped; run /reload-plugins' },
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({
      name: 'fix-queue',
      description: 'Show the fix requests sent from the iOS app in the simulator',
    })
    const started = await next(e)

    void $.ui.open({ id: PANE, title: TITLE })
    void listen($)
    // Keeps the elapsed seconds of a running fix ticking in the pane.
    $.clock.every(1000, () => {
      void (async () => {
        if ((await read($, reports)).some(isActive)) {
          await update($, now, () => Date.now())
        }
      })()
    })

    return started
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [...composed.sections, { id: 'fixkit:fix-requests', text: INSTRUCTIONS, scope: 'session' }],
    }
  })

  on('command.run', { command: 'fix-queue' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Fix queue opened.' }
  })

  // A status that fails to save must not fail the tool call itself.
  on('tool.call', async ($, e, next) => {
    const id = current
    if (id === null || e.agentId !== undefined) {
      return next(e)
    }

    if (isBuildAndRun(String(e.tool))) {
      await patch($, id, one => ({ ...one, status: 'rebuilding' }))
      const ran = await next(e)
      // A launch during the call has marked the report live; a failed call leaves it fixing.
      if (ran.deny !== undefined || ran.isError === true) {
        await patch($, id, one => (one.status === 'rebuilding' ? { ...one, status: 'fixing' } : one))
      }

      return ran
    }

    if (e.tool === 'Edit' || e.tool === 'Write') {
      const name = e.file_path.split('/').pop() ?? e.file_path
      await patch($, id, one => (one.edited.includes(name) ? one : { ...one, edited: [...one.edited, name] }))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const id = current
    if (id !== null && e.agentId === undefined) {
      current = null
      const finishedAt = await $.clock.now()
      // Live only when the app launched with the fix and the turn ended with an answer.
      await patch($, id, one => ({
        ...one,
        status: e.reason === 'answer' && one.status === 'live' ? 'live' : 'stopped',
        finishedAt,
      }))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, reports)
    const link = await read($, receiver)
    const clock = (await read($, now)) || (await $.clock.now())
    const width = Math.max(20, e.props.bodyColumns)
    // Each report takes five rows; the newest ones are kept in view.
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 30) - 6) / 5))

    return (
      <Box flexDirection="column" width={width}>
        <Text color={link.state === 'failed' ? 'red' : link.state === 'listening' ? 'green' : 'yellow'}>
          {link.state === 'listening' ? '●' : '○'} {link.state} <Text dimColor>{link.detail}</Text>
        </Text>
        {link.notice !== undefined && (
          <Text dimColor wrap="wrap">
            {link.notice}
          </Text>
        )}

        {list.length === 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>No fix requests yet.</Text>
            <Text dimColor wrap="wrap">
              Long press any element in the app, type what is wrong and press Return.
            </Text>
          </Box>
        )}

        {list.slice(-room).map(report => {
          const look = LOOK[report.status]
          const seconds = Math.max(0, Math.round(((report.finishedAt ?? clock) - report.receivedAt) / 1000))

          return (
            <Box flexDirection="column" marginTop={1}>
              <Box justifyContent="space-between">
                <Text color={look.color} bold>
                  {look.mark} {report.id} {look.label}
                </Text>
                <Text dimColor>{seconds}s</Text>
              </Box>
              <Text bold wrap="truncate-end">
                “{report.comment}”
              </Text>
              <Text wrap="truncate-middle">{pressedLabel(report)}</Text>
              {report.source !== null && (
                <Text dimColor wrap="truncate-start">
                  {report.source}
                </Text>
              )}
              {report.edited.length > 0 && (
                <Text color="cyan" wrap="truncate-end">
                  edited {report.edited.join(', ')}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
