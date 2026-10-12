// Codex's SessionStart hook. In an app project it makes sure a receiver serves this session
// and gives the model the instructions for `[fix …]` prompts; anywhere else it does nothing.
// Codex waits for it before the session starts, so it never waits on the receiver itself.
import { spawn } from 'node:child_process'
import { appendFileSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { instructionsFor, projectKind } from '../core/prompt.mjs'
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
    // Codex has no tool of the mod's: the receiver hot reloads a Flutter app for a request of its own.
    const additionalContext = instructionsFor(projectKind(project), {
      reload: `run curl -s -X POST http://127.0.0.1:${PORT}/reload, which answers {"ok":true} once the app has reloaded, or {"ok":false} with the reason; it needs network access, so when the sandbox blocks it, ask to run it outside the sandbox`,
      restart: `Send -d '{"restart":true}' with it`,
    })
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }))
  }
} catch (error) {
  // A failed hook must never stop the session from starting.
  try {
    appendFileSync(LOG, `session start: ${error}\n`)
  } catch {}
}
