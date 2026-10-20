// Receives fix reports from an app's FixKit debug build and hands them to a driver
// for the harness at work. By default that is Claude Code's fixkit mod: one JSON line
// on stdout per event, started by the mod with $.process.spawn and killed with it.
// With --codex <session> it is the Codex driver, which queues each report in that
// session and follows it through Codex's hooks. One receiver owns the port at a time: a
// newer one asks the older one to leave. No dependencies beside AXe, which is
// optional: it tells which element a report's touch landed on. A React Native app
// sends no simulator and no screenshot: the receiver finds the one, takes the other,
// and turns the app's stacks into source lines through Metro. A Flutter app sends its VM service
// at launch, through which the receiver hot reloads it for the mod's hot_reload tool. An Android
// app reaches the receiver through adb, which keeps the port reversed on every device; adb also
// takes its screenshot and reads its screen.
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Adb, adbCandidates, emulatorRunning, macVmService, pickDevice } from './android.mjs'
import { NO_APP, reload } from './flutter.mjs'
import { axeCandidates, describeScreen, elementAt } from './inspect.mjs'
import { bundleMap, parseStack, sourcesFor, withSources } from './metro.mjs'
import { bootedSimulator, captureScreen } from './simulator.mjs'
import { parseHierarchy } from './uiautomator.mjs'

const PORT = Number(process.env.FIXKIT_PORT ?? 4747)
const dir = join(process.cwd(), '.fixkit')
const reportsDir = join(dir, 'reports')
const statusFile = join(dir, 'status.json')
// Tells this run's report ids apart from an earlier run's.
const run = Date.now().toString(36)
let count = 0

/** Claude Code's mod reads the events on stdout and writes every status change to a file. */
const stdoutDriver = () => ({
  agent: 'Claude Code',
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

// The adb that answered last, the same way.
let adb = null

// The maps of the bundles React Native apps launched with, by bundle URL, each a promise of the map
// or of null. A Fast Refresh changes the bundle Metro serves but not the code the app runs, so its
// stacks are read with the map of launch.
const maps = new Map()

// The VM service of the Flutter app that launched last, which `POST /reload` hot reloads, and
// whether it runs on Android, where that address is the device's.
let flutterApp = null

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

/** The adb that answered last, or the first that answers; null without one. */
async function findAdb() {
  if (adb) return adb
  for (const path of adbCandidates()) {
    const candidate = new Adb(path)
    try {
      await candidate.devices()
      return (adb = candidate)
    } catch (error) {
      log(`${path}: ${error.message}`)
    }
  }
  return null
}

// Said once: without adb an Android app never reaches the receiver, so nothing else would tell.
let toldAdb = false

/**
 * Reverses the receiver's port on every Android device adb lists, so the app reaches it at
 * 127.0.0.1 as in the simulator. It runs at start and every two seconds, for an emulator booted later.
 */
async function keepReversed(port) {
  const tool = await findAdb()
  if (tool === null) {
    if (!toldAdb && (await emulatorRunning())) {
      toldAdb = true
      emit({ type: 'notice', message: 'Install the Android SDK platform-tools so Android apps reach FixKit: adb was not found' })
    }
    return
  }
  let serials
  try {
    serials = await tool.devices()
  } catch (error) {
    log(`adb: ${error.message}`)
    adb = null
    return
  }
  // Asked of the device each time: an emulator restarted, or a restart of the adb server, drops
  // the reverse while the device stays listed.
  for (const serial of serials) {
    const ports = await tool.reversedPorts(serial).catch(() => [])
    if (ports.includes(port)) continue
    await tool.reverse(serial, port).catch(error => log(`adb reverse on ${serial}: ${error.message}`))
  }
}

let reversing = null
const reverseNow = port => (reversing ??= keepReversed(port).finally(() => (reversing = null)))

// Said once: with two Android devices on one API level, a report that names none cannot tell which is its own.
let toldDevice = false

/** The Android device a report came from: the only one online, or the only one on the app's API level. */
async function deviceOf(report) {
  const tool = await findAdb()
  if (tool === null) return null
  const serials = await tool.devices()
  const { serial, online } = await pickDevice(serials, { os: report.os, sdkOf: one => tool.sdkOf(one) })
  if (serial === null && online > 1 && !toldDevice) {
    toldDevice = true
    emit({ type: 'notice', message: `Run one Android emulator per API level, one at a time for Flutter: ${online} run, so reports come without a screenshot or what accessibility says` })
  }
  return serial
}

/** The Android device's accessibility tree in the app's units, or null when uiautomator can't read it. */
async function readAndroidTree({ device, pixelRatio }) {
  const tool = await findAdb()
  if (tool === null) return null
  try {
    return parseHierarchy(await tool.dump(device), typeof pixelRatio === 'number' && pixelRatio > 0 ? pixelRatio : 1)
  } catch (error) {
    log(`uiautomator: ${error.message}`)
    return null
  }
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
  if (!report.touch) return null
  const tree = report.device ? await readAndroidTree(report) : report.simulator ? await readTree(report.simulator) : null
  if (tree === null) return null
  try {
    writeFileSync(join(reportsDir, `${id}.ax.json`), JSON.stringify(tree))
  } catch {}
  return elementAt(tree, report.touch)
}

/** Saves the app's screenshot, or takes the simulator's or the Android device's; the path, or null without one. */
async function saveScreenshot(png, { simulator, device }, path) {
  const file = join(process.cwd(), path)
  try {
    if (png) writeFileSync(file, Buffer.from(png, 'base64'))
    else if (device) {
      const tool = await findAdb()
      if (tool === null) return null
      await tool.screencap(device, file)
    } else if (simulator) await captureScreen(simulator, file)
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
  const android = sent.platform === 'android'
  const where = android ? await deviceOf(sent).catch(() => null) : await simulatorOf(sent)
  const report = where ? { ...sent, [android ? 'device' : 'simulator']: where } : sent
  const [screenshot, accessibility, located] = await Promise.all([
    saveScreenshot(screenshotPNG, report, join('.fixkit', 'reports', `${id}.png`)),
    lookUp(id, report).catch(() => null),
    sources,
  ])
  return { ...report, element: withSources(report.element, located), id, screenshot, accessibility }
}

/** The Flutter app's VM service as the Mac reaches it: on Android, through the forward `flutter run` keeps. */
async function vmServiceOnMac({ vmService, android }) {
  const tool = android ? await findAdb() : null
  return tool === null ? vmService : macVmService(vmService, await tool.forwards().catch(() => []))
}

/** A request's body as text. */
const readBody = req =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

/** A request's body as JSON. */
const readJson = req => readBody(req).then(JSON.parse)

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

/** The app's answer about a report: the run, its status and the agent working on it. */
const answerFor = (id, all) => ({ run, id, status: id ? (all[id] ?? 'queued') : null, agent: driver.agent })

const reply = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/status') {
    return reply(res, 200, answerFor(url.searchParams.get('id'), statuses()))
  }

  // The app has launched: during a fix that means the fix is on screen, however it was built.
  // The answer is the report the agent is working on (reports are worked through in order), else
  // the newest one, for the app to follow or announce. Every answer the app reads names the agent.
  if (req.method === 'POST' && url.pathname === '/launched') {
    // A React Native app sends a stack from the bundle it launched with, a Flutter app its VM
    // service; a Swift app sends nothing.
    void readJson(req)
      .then(sent => {
        keepMap(sent.stack)
        if (typeof sent.vmService === 'string') flutterApp = { vmService: sent.vmService, android: sent.platform === 'android' }
      })
      .catch(() => {})
    emit({ type: 'launched' })
    const all = statuses()
    const id = Object.keys(all).find(key => ACTIVE.has(all[key])) ?? (count > 0 ? `r${count}` : null)
    return reply(res, 200, answerFor(id, all))
  }

  if (req.method === 'POST' && url.pathname === '/report') {
    const ready = readJson(req).then(sent => prepare(sent, `r${++count}`))
    ready.then(
      report => reply(res, 200, { id: report.id, agent: driver.agent }),
      error => reply(res, 400, { error: String(error) }),
    )
    delivered = delivered.then(() => ready.then(report => emit({ type: 'report', report }), () => {}))
    return
  }

  // The mod's hot_reload tool: reload, or restart, the Flutter app that launched last.
  if (req.method === 'POST' && url.pathname === '/reload') {
    void readJson(req)
      .catch(() => ({}))
      .then(async sent => {
        if (flutterApp === null) return { ok: false, error: NO_APP }
        return reload(await vmServiceOnMac(flutterApp), { restart: sent?.restart === true }).then(() => ({ ok: true }), error => ({ ok: false, error: error.message }))
      })
      .then(answer => reply(res, 200, answer))
    return
  }

  // A newer session's receiver asks for the port.
  if (req.method === 'POST' && url.pathname === '/shutdown') {
    reply(res, 200, { run })
    leave('a newer session took over the reports')
    return
  }

  // The handler is async for the driver's routes; nothing they throw may take the receiver down.
  try {
    if (await driver.route?.(req, res, url)) return
  } catch (error) {
    log(`${url.pathname}: ${error}`)
    if (!res.headersSent) reply(res, 500, { error: String(error) })
    return
  }

  reply(res, 404, { error: 'not found' })
})

/** Gives the port up and exits, saying why, once the request that asked has its answer. */
function leave(message) {
  emit({ type: 'error', message })
  server.close(() => process.exit(0))
  server.closeIdleConnections()
  setTimeout(() => server.closeAllConnections(), 1000).unref()
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
  const { port } = server.address()
  emit({ type: 'ready', port })
  void reverseNow(port)
  setInterval(() => void reverseNow(port), 2000).unref()
})
