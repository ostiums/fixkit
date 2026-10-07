// Test helpers: a receiver in a project folder of its own, on a free port.
import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const RECEIVER = new URL('../server/receiver.mjs', import.meta.url).pathname

/** An empty folder for a project. */
export const project = () => realpathSync(mkdtempSync(join(tmpdir(), 'fixkit-')))

/** A port nothing listens on. */
export function freePort() {
  return new Promise(resolve => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

/** Waits for `check` to return something, trying every 20 ms for up to 3 s. */
export async function until(check, what = 'the receiver') {
  for (let waited = 0; waited < 3000; waited += 20) {
    const value = await check()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`${what} never got there`)
}

/** Starts the receiver and waits until it answers; `lines` holds what it printed on stdout. */
export async function startReceiver({ args = [], env = {}, cwd = project() } = {}) {
  const port = await freePort()
  const child = spawn(process.execPath, [RECEIVER, ...args], {
    cwd,
    env: { ...process.env, FIXKIT_PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const lines = []
  let pending = ''
  child.stdout.on('data', chunk => {
    const parts = (pending + chunk).split('\n')
    pending = parts.pop()
    lines.push(...parts.filter(Boolean).map(line => JSON.parse(line)))
  })
  const exited = new Promise(resolve => child.on('exit', resolve))
  const url = path => `http://127.0.0.1:${port}${path}`
  await until(() => fetch(url('/status')).then(res => res.ok, () => false))

  return {
    cwd,
    port,
    lines,
    exited,
    url,
    post: (path, body) => fetch(url(path), { method: 'POST', body: JSON.stringify(body) }).then(res => res.json()),
    get: path => fetch(url(path)).then(res => res.json()),
    stop: () => {
      child.kill()
      return exited
    },
  }
}
