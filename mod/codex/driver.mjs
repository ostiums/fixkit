// The receiver's driver for Codex. The receiver runs it with --codex <session>, started
// by the SessionStart hook: it queues each report in that session with `codex queue`,
// and follows the report's turn through the hooks Codex posts to /codex/hook.

/** @typedef {import('../types').FixStatus} FixStatus */

/**
 * @param {{ session: string, cwd: string, leave: (message: string) => void, log: (message: string) => void }} options
 */
export function codexDriver({ session }) {
  /** @type {Map<string, FixStatus>} */
  const statuses = new Map()

  return {
    watchesParent: false,
    emit() {},
    statuses: () => Object.fromEntries(statuses),

    /** Serves this driver's endpoints; true when the request was one of them. */
    async route(req, res, url) {
      if (req.method === 'GET' && url.pathname === '/codex/session') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ session }))
        return true
      }
      return false
    },
  }
}
