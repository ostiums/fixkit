// Receives fix reports from an app's FixKit debug build and hands them to a driver
// for the harness at work. By default that is Claude Code's fixkit mod: one JSON line
// on stdout per event, started by the mod with $.process.spawn and killed with it.
// With --codex <session> it is the Codex driver, which queues each report in that
// session and follows it through Codex's hooks. One receiver owns the port at a time: a
// newer one asks the older one to leave. No dependencies beside AXe, which is
// optional: it tells which element a report's touch landed on. A React Native app
// sends no simulator and no screenshot: the receiver finds the one, takes the other,
// and turns the app's stacks into source lines through Metro.
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { axeCandidates, describeScreen, elementAt } from './inspect.mjs'
import { bundleMap, parseStack, sourcesFor, withSources } from './metro.mjs'
import { bootedSimulator, captureScreen } from './simulator.mjs'

const PORT = Number(process.env.FIXKIT_PORT ?? 4747)
const dir = join(process.cwd(), '.fixkit')
const reportsDir = join(dir, 'reports')
const statusFile = join(dir, 'status.json')
// Tells this run's report ids apart from an earlier run's.
const run = Date.now().toString(36)
let count = 0

/** Claude Code's mod reads the events on stdout and writes every status change to a file. */
const stdoutDriver = () => ({
  watchesParent: true,
  emit: event => process.stdout.write(JSON.stringify(event) + '\n'),
  statuses: () => {
    try {
      return JSON.parse(readFileSync(statusFile, 'utf8'))
    } catch {
      return {}
    }
  },
})

const log = message => process.stderr.write(`${message}\n`)
const driver =
  process.argv[2] === '--codex'
    ? (await import('../codex/driver.mjs')).codexDriver({ session: process.argv[3], cwd: process.cwd(), leave, log })
    : stdoutDriver()
const emit = event => driver.emit(event)
const statuses = () => driver.statuses()
const ACTIVE = new Set(['queued', 'fixing', 'rebuilding'])

// The AXe that answered last; the search for one runs again only when it fails.
let axe = null

// The maps of the bundles React Native apps launched with, by bundle URL, each a promise of the map
// or of null. A Fast Refresh changes the bundle Metro serves but not the code the app runs, so its
// stacks are read with the map of launch.
const maps = new Map()

/** Keeps the map of the bundle a React Native app launched with, the one its stack's first frame runs from. */
function keepMap(stack) {
  const bundle = typeof stack === 'string' ? parseStack(stack)[0]?.file : undefined
  if (!bundle) return
  const map = bundleMap(bundle).catch(error => {
    process.stderr.write(`source map: ${error.message}\n`)
    return null
  })
  maps.set(bundle, map)
}

// Said once: with two simulators booted on one iOS version, a report that names none cannot tell which is its own.
let toldSimulator = false

/** The simulator a report came from: its own word, else the one booted on its iOS version. */
async function simulatorOf(report) {
  if (report.simulator) return report.simulator
  const { udid, booted } = await bootedSimulator(report.os).catch(() => ({ udid: null, booted: 0 }))
  if (udid === null && booted > 1 && !toldSimulator) {
    toldSimulator = true
    const on = report.os ? ` on iOS ${report.os}` : ''
    emit({ type: 'notice', message: `Boot one simulator per iOS version: ${booted} run${on}, so reports come without a screenshot or what accessibility says` })
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

/** Saves the app's screenshot, or takes the simulator's; the path, or null without one. */
async function saveScreenshot(png, simulator, path) {
  try {
    if (png) writeFileSync(join(process.cwd(), path), Buffer.from(png, 'base64'))
    else if (simulator) await captureScreen(simulator, join(process.cwd(), path))
    else return null
    return path
  } catch (error) {
    process.stderr.write(`screenshot: ${error.message}\n`)
    return null
  }
}

/**
 * A report as the mod takes it: its screenshot, what accessibility says was pressed and the
 * element's source lines. The app waits for the answer until all of it is done and takes no new
 * long press meanwhile, so the screen read is the one pressed.
 */
async function prepare({ screenshotPNG, stacks, ...sent }, id) {
  const sources = Array.isArray(stacks) && stacks.length > 0 ? sourcesFor(stacks, { maps }).catch(() => null) : null
  const simulator = await simulatorOf(sent)
  const report = simulator ? { ...sent, simulator } : sent
  const [screenshot, accessibility, located] = await Promise.all([
    saveScreenshot(screenshotPNG, simulator, join('.fixkit', 'reports', `${id}.png`)),
    lookUp(id, report).catch(() => null),
    sources,
  ])
  return { ...report, element: withSources(report.element, located), id, screenshot, accessibility }
}

/** A request's body as text. */
const readBody = req =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

// Reports reach the mod in the order they arrived, each once it is prepared. Each takes its place
// in line as it arrives and its lookups start at once, so a slow one never makes the next one read
// a later screen.
let delivered = Promise.resolve()

// The session that started this receiver is gone when its pipe breaks or the
// process is handed to launchd. Without this the receiver would keep the port
// and swallow every report meant for the next session. A driver started by a
// short-lived hook has no such parent and says when its session ends.
if (driver.watchesParent) {
  const parent = process.ppid
  process.stdout.on('error', () => process.exit(0))
  setInterval(() => {
    if (process.ppid !== parent) process.exit(0)
  }, 1000).unref()
}

const reply = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/status') {
    const id = url.searchParams.get('id')
    return reply(res, 200, { run, id, status: id ? (statuses()[id] ?? 'queued') : null })
  }

  // The app has launched: during a fix that means the fix is on screen, however it was built.
  // The answer is the report Claude is working on (reports are worked through in order), else
  // the newest one, for the app to follow or announce.
  if (req.method === 'POST' && url.pathname === '/launched') {
    // A React Native app sends a stack from the bundle it launched with; a Swift app sends nothing.
    void readBody(req).then(body => keepMap(JSON.parse(body).stack)).catch(() => {})
    emit({ type: 'launched' })
    const all = statuses()
    const id = Object.keys(all).find(key => ACTIVE.has(all[key])) ?? (count > 0 ? `r${count}` : null)
    return reply(res, 200, { run, id, status: id ? (all[id] ?? 'queued') : null })
  }

  if (req.method === 'POST' && url.pathname === '/report') {
    const ready = readBody(req).then(body => prepare(JSON.parse(body), `r${++count}`))
    ready.then(
      report => reply(res, 200, { id: report.id }),
      error => reply(res, 400, { error: String(error) }),
    )
    delivered = delivered.then(() => ready.then(report => emit({ type: 'report', report }), () => {}))
    return
  }

  // A newer session's receiver asks for the port.
  if (req.method === 'POST' && url.pathname === '/shutdown') {
    reply(res, 200, { run })
    leave('a newer session took over the reports')
    return
  }

  if (await driver.route?.(req, res, url)) return

  reply(res, 404, { error: 'not found' })
})

/** Gives the port up and exits, saying why. */
function leave(message) {
  emit({ type: 'error', message })
  server.close(() => process.exit(0))
  server.closeAllConnections()
}

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
  emit({ type: 'ready', port: server.address().port })
})
