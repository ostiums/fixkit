// The receiver's driver for Codex. The receiver runs it with --codex <session>, started
// by the SessionStart hook: it queues each report in that session with `codex queue`,
// and follows the report's turn through the hooks Codex posts to /codex/hook.
import { execFile } from 'node:child_process'
import { relative } from 'node:path'

import * as fixes from '../core/fixes.mjs'
import { isBuildAndRun, promptFor } from '../core/prompt.mjs'

/** @typedef {import('../types').FixStatus} FixStatus */
/** @typedef {import('../types').Incoming} Incoming */

/**
 * Adds a message to the session's queue on Codex's shared app-server, which starts it at once
 * when the session is idle and after the running turn otherwise. Text only: `codex queue` takes
 * no images, and the screenshot's path is in the message.
 * @param {string} session
 * @param {string} prompt
 * @returns {Promise<void>}
 */
export function codexQueue(session, prompt) {
  // `--name=value`, so a comment that starts with "-" is never read as a flag.
  const args = ['queue', `--thread=${session}`, `--message=${prompt}`]
  return new Promise((resolve, reject) => {
    execFile(process.env.FIXKIT_CODEX ?? 'codex', args, { timeout: 15_000 }, (error, _stdout, stderr) =>
      error ? reject(new Error(stderr.trim() || error.message)) : resolve(),
    )
  })
}

/**
 * The report a prompt was sent for: the id in its last line, `[fix r1] …`.
 * @param {string} prompt
 */
export function fixIdIn(prompt) {
  return /(?:^|\n)\[fix (r\d+)\][^\n]*$/.exec(prompt.trimEnd())?.[1] ?? null
}

/**
 * @param {{
 *   session: string,
 *   cwd: string,
 *   leave: (message: string) => void,
 *   log: (message: string) => void,
 *   queue?: (session: string, prompt: string) => Promise<void>,
 * }} options
 */
export function codexDriver({ session, cwd, leave, log, queue = codexQueue }) {
  /** @type {Map<string, FixStatus>} Kept in memory: the app polls it through the receiver. */
  const statuses = new Map()
  /** @type {{ id: string, turn: string } | null} The report whose turn is running. */
  let current = null
  /**
   * @type {Map<string, string>} Each fix turn's report until its Stop or Interrupt. Async hooks
   * run in shells of their own, so a turn's Stop may come after the next turn's prompt.
   */
  const turns = new Map()
  // One `codex queue` at a time, so reports reach the session in the order they came.
  let delivered = Promise.resolve()

  /**
   * Reports keep the order they came in: the receiver answers a launch with the first active one.
   * @param {string} id
   * @param {FixStatus} status
   */
  function set(id, status) {
    statuses.set(id, status)
    if (statuses.size > 50) statuses.delete(statuses.keys().next().value)
  }

  /**
   * A fix turn has ended: by its own Stop or Interrupt, or, when the session has moved on to
   * another turn first, as answered. Codex starts no queued turn after an interrupt, and a late
   * Interrupt still corrects it.
   * @param {string} turn
   * @param {boolean} answered
   */
  function finish(turn, answered) {
    const id = turns.get(turn)
    if (id === undefined) return
    set(id, fixes.finished(statuses.get(id) ?? 'fixing', answered))
    if (current?.turn === turn) current = null
  }

  /** @param {Incoming} incoming */
  function accept(incoming) {
    const where = (/** @type {string} */ file) => (file.startsWith(cwd + '/') ? relative(cwd, file) : file)
    const { file, line, usedAt = [] } = incoming.element ?? {}
    const source = file && line ? `${where(file)}:${line}` : null
    const prompt = promptFor(incoming, source, usedAt.map(use => `${where(use.file)}:${use.line}`))
    set(incoming.id, 'queued')
    delivered = delivered.then(() =>
      queue(session, prompt).catch(error => {
        log(`codex queue for ${incoming.id}: ${error.message}`)
        set(incoming.id, 'stopped')
      }),
    )
  }

  /**
   * One hook's input, as Codex wrote it on the hook's stdin. Only this session's own turns
   * count: a subagent's or an earlier turn's events move nothing.
   * @param {Record<string, any>} input
   */
  function hook(input) {
    const { hook_event_name: event, session_id, turn_id, agent_id, tool_name } = input
    if (session_id !== session || agent_id) return
    if (event === 'SessionEnd') return leave('the Codex session ended')

    if (event === 'Stop' || event === 'Interrupt') {
      finish(turn_id, event === 'Stop')
      turns.delete(turn_id)
      return
    }

    if (event === 'UserPromptSubmit') {
      // More input for the running turn changes nothing.
      if (current?.turn === turn_id) return
      if (current !== null) finish(current.turn, true)
      const id = fixIdIn(String(input.prompt ?? ''))
      if (id !== null && statuses.has(id)) {
        current = { id, turn: turn_id }
        turns.set(turn_id, id)
        if (turns.size > 50) turns.delete(turns.keys().next().value)
        set(id, fixes.started())
      }
      return
    }

    if (current === null || current.turn !== turn_id) return
    if (event === 'PreToolUse' && isBuildAndRun(String(tool_name))) {
      set(current.id, fixes.building())
    } else if (event === 'PostToolUse' && isBuildAndRun(String(tool_name))) {
      set(current.id, fixes.buildEnded(statuses.get(current.id) ?? 'fixing'))
    }
  }

  return {
    watchesParent: false,
    statuses: () => Object.fromEntries(statuses),
    hook,

    /** @param {{ type: string, report?: Incoming, message?: string }} event */
    emit(event) {
      if (event.type === 'report' && event.report) accept(event.report)
      else if (event.type === 'launched' && current !== null) set(current.id, fixes.launched())
      else if (event.message) log(event.message)
    },

    /** Serves this driver's endpoints; true when the request was one of them. */
    async route(req, res, url) {
      const answer = (/** @type {number} */ code, /** @type {object} */ body) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
        return true
      }
      if (req.method === 'GET' && url.pathname === '/codex/session') return answer(200, { session })
      if (req.method === 'POST' && url.pathname === '/codex/hook') {
        try {
          // A hook killed mid-send aborts the body; that must not take the receiver down.
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          hook(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          return answer(200, {})
        } catch (error) {
          return answer(400, { error: String(error) })
        }
      }
      return false
    },
  }
}
