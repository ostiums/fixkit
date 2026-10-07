// Receives fix reports from an app's FixKit debug build and hands them to the
// fixkit mod: one JSON line on stdout per event. Started by the mod with
// $.process.spawn and killed with it. One receiver owns the port at a time: a
// newer one asks the older one to leave. No dependencies beside AXe, which is
// optional: it tells which element a report's touch landed on. A React Native app
// sends no simulator and no screenshot: the receiver finds the one, takes the other,
// and turns the app's stacks into source lines through Metro.
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { axeCandidates, describeScreen, elementAt } from './inspect.mjs'
import { bundleMap, sourcesFor, withSources } from './metro.mjs'
import { bootedSimulator, captureScreen } from './simulator.mjs'

const PORT = Number(process.env.FIXKIT_PORT ?? 4747)
const dir = join(process.cwd(), '.fixkit')
const reportsDir = join(dir, 'reports')
const statusFile = join(dir, 'status.json')
// Tells this run's report ids apart from an earlier run's.
const run = Date.now().toString(36)
let count = 0

const emit = event => process.stdout.write(JSON.stringify(event) + '\n')
const ACTIVE = new Set(['queued', 'fixing', 'rebuilding'])

// The AXe that answered last; the search for one runs again only when it fails.
let axe = null

// The maps of the bundles React Native apps launched with, by bundle URL. A Fast Refresh changes the
// bundle Metro serves but not the code the app runs, so its stacks are read with the map of launch.
const maps = new Map()

/** Keeps the map of the bundle a React Native app says it launched with. */
function keepMap(body) {
  let bundle
  try {
    bundle = JSON.parse(body).bundle
  } catch {
    return
  }
  if (typeof bundle !== 'string') return
  bundleMap(bundle)
    .then(map => maps.set(bundle, map))
    .catch(error => process.stderr.write(`source map: ${error.message}\n`))
}

// Said once: with two simulators booted on one iOS version, a React Native report cannot tell which is its own.
let toldSimulator = false

/** The simulator a report came from: its own word, else for React Native the one booted on its iOS version. */
async function simulatorOf(report) {
  if (report.simulator) return report.simulator
  if (report.platform !== 'react-native') return null
  const { udid, booted } = await bootedSimulator(report.os).catch(() => ({ udid: null, booted: 0 }))
  if (udid === null && booted > 1 && !toldSimulator) {
    toldSimulator = true
    emit({ type: 'notice', message: `Boot one simulator per iOS version: ${booted} run iOS ${report.os}, so reports come without a screenshot` })
  }
  return udid
}

/** The simulator's accessibility tree, through the AXe that answered last or the first that answers. */
async function readTree(udid) {
  if (axe) {
    try {
      return await describeScreen(axe, udid)
    } catch (error) {
      process.stderr.write(`${axe}: ${error.message}\n`)
      axe = null
    }
  }
  const candidates = axeCandidates()
  if (candidates.length === 0) {
    emit({ type: 'notice', message: 'Install AXe so reports name the element: brew install cameroncooke/axe/axe' })
  }
  for (const path of candidates) {
    try {
      const tree = await describeScreen(path, udid)
      axe = path
      return tree
    } catch (error) {
      process.stderr.write(`${path}: ${error.message}\n`)
    }
  }
  return null
}

/**
 * What accessibility says the touch landed on, or null. The app sends a report once its
 * composer has closed and waits for the answer, so the screen is what was pressed; the whole
 * tree is kept beside the screenshot.
 */
async function lookUp(id, report) {
  if (!report.simulator || !report.touch) return null
  const tree = await readTree(report.simulator)
  if (tree === null) return null
  try {
    writeFileSync(join(reportsDir, `${id}.ax.json`), JSON.stringify(tree))
  } catch {}
  return elementAt(tree, report.touch)
}

// Reports reach the mod in the order they arrived, each once its own lookup is done. The
// lookups start at once, so a slow one never makes the next one read a later screen.
let delivered = Promise.resolve()

// The session that started this receiver is gone when its pipe breaks or the
// process is handed to launchd. Without this the receiver would keep the port
// and swallow every report meant for the next session.
const parent = process.ppid
process.stdout.on('error', () => process.exit(0))
setInterval(() => {
  if (process.ppid !== parent) process.exit(0)
}, 1000).unref()

// The mod writes every status change to this file; the app polls it through us.
const statuses = () => {
  try {
    return JSON.parse(readFileSync(statusFile, 'utf8'))
  } catch {
    return {}
  }
}

const reply = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/status') {
    const id = url.searchParams.get('id')
    return reply(res, 200, { run, id, status: id ? (statuses()[id] ?? 'queued') : null })
  }

  // The app has launched: during a fix that means the fix is on screen, however it was built.
  // The answer is the report Claude is working on (reports are worked through in order), else
  // the newest one, for the app to follow or announce.
  if (req.method === 'POST' && url.pathname === '/launched') {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => keepMap(Buffer.concat(chunks).toString('utf8')))
    emit({ type: 'launched' })
    const all = statuses()
    const id = Object.keys(all).find(key => ACTIVE.has(all[key])) ?? (count > 0 ? `r${count}` : null)
    return reply(res, 200, { run, id, status: id ? (all[id] ?? 'queued') : null })
  }

  if (req.method === 'POST' && url.pathname === '/report') {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', async () => {
      try {
        const { screenshotPNG, stacks, ...sent } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const id = `r${++count}`
        const simulator = await simulatorOf(sent)
        const report = simulator ? { ...sent, simulator } : sent
        let screenshot = null
        if (screenshotPNG) {
          screenshot = join('.fixkit', 'reports', `${id}.png`)
          writeFileSync(join(process.cwd(), screenshot), Buffer.from(screenshotPNG, 'base64'))
        } else if (simulator) {
          // The app has drawn its outline and waits for the answer, so the screen is what was pressed.
          const path = join('.fixkit', 'reports', `${id}.png`)
          try {
            await captureScreen(simulator, join(process.cwd(), path))
            screenshot = path
          } catch (error) {
            process.stderr.write(`screenshot: ${error.message}\n`)
          }
        }
        // The answer waits for the lookup and the sources: until it comes the app takes no new
        // long press, which would change the screen being read.
        const accessibility = lookUp(id, report).catch(() => null)
        const sources = Array.isArray(stacks) && stacks.length > 0 ? sourcesFor(stacks, fetch, maps).catch(() => null) : null
        const ready = Promise.all([accessibility, sources])
        void ready.then(() => reply(res, 200, { id }))
        delivered = delivered.then(async () => {
          const [found, located] = await ready
          const element = withSources(report.element, located)
          emit({ type: 'report', report: { ...report, ...(element && { element }), id, screenshot, accessibility: found } })
        })
      } catch (error) {
        reply(res, 400, { error: String(error) })
      }
    })
    return
  }

  // A newer session's receiver asks for the port.
  if (req.method === 'POST' && url.pathname === '/shutdown') {
    reply(res, 200, { run })
    emit({ type: 'error', message: 'a newer session took over the reports' })
    server.close(() => process.exit(0))
    server.closeAllConnections()
    return
  }

  reply(res, 404, { error: 'not found' })
})

// The port is taken by an earlier receiver: one left behind by a closed session, or the
// one a reload of the mod is replacing. Ask it to leave, then try again.
let attempts = 0
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && ++attempts <= 10) {
    fetch(`http://127.0.0.1:${PORT}/shutdown`, { method: 'POST' })
      .catch(() => {})
      .finally(() => setTimeout(() => server.listen(PORT, '127.0.0.1'), 300))
    return
  }
  emit({ type: 'error', message: error.code === 'EADDRINUSE' ? `port ${PORT} is in use` : String(error) })
  process.exit(1)
})

server.listen(PORT, '127.0.0.1', () => {
  // Only the receiver that holds the port may clear the previous run's files.
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(reportsDir, { recursive: true })
  emit({ type: 'ready', port: PORT })
})
