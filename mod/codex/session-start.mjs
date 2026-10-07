// Codex's SessionStart hook. In an app project it makes sure a receiver serves this session
// and gives the model the instructions for `[fix …]` prompts; anywhere else it does nothing.
// Codex waits for it before the session starts, so it never waits on the receiver itself.
import { spawn } from 'node:child_process'
import { appendFileSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { instructionsFor } from '../core/prompt.mjs'
import { appProject } from './project.mjs'

const PORT = Number(process.env.FIXKIT_PORT ?? 4747)
const RECEIVER = new URL('../server/receiver.mjs', import.meta.url).pathname
// Nobody reads a detached receiver's output, so it and this hook's errors go here.
const LOG = join(tmpdir(), 'fixkit-codex.log')

/** The session the receiver on the port serves, if one does. */
async function servedSession() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/codex/session`, { signal: AbortSignal.timeout(300) })
    return res.ok ? (await res.json()).session : null
  } catch {
    return null
  }
}

/** Starts a receiver for the session; it asks any older one for the port. */
function startReceiver(session, cwd) {
  const log = openSync(LOG, 'a')
  spawn(process.execPath, [RECEIVER, '--codex', session], { cwd, detached: true, stdio: ['ignore', log, log] }).unref()
}

try {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const { session_id: session, cwd = process.cwd() } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const project = appProject(cwd)

  if (project !== null) {
    try {
      if ((await servedSession()) !== session) startReceiver(session, cwd)
    } catch (error) {
      appendFileSync(LOG, `session start: ${error}\n`)
    }
    const additionalContext = instructionsFor(project.packageJson)
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }))
  }
} catch (error) {
  // A failed hook must never stop the session from starting.
  try {
    appendFileSync(LOG, `session start: ${error}\n`)
  } catch {}
}
