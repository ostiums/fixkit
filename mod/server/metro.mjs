// Turns the stacks a React Native app sends with a report into source lines, through the Metro
// server that bundled the app. In development React keeps, for every element, an Error whose stack
// shows where its JSX was written; a source map takes the bundle's lines back to the app's files.
// Metro's /symbolicate answers for the bundle as it is now, which after a Fast Refresh is lines away
// from the code the app still runs, so the map of the bundle the app launched with is kept and read
// first. No dependencies.

/** The bundle frames of one stack, `at name (url:line:column)`; native and anonymous frames go. */
export function parseStack(stack) {
  return stack
    .split('\n')
    .map(line => line.match(/^\s*at (.+?) \((https?:\/\/.+):(\d+):(\d+)\)$/))
    .filter(Boolean)
    .map(([, methodName, file, lineNumber, column]) => ({
      methodName,
      file,
      lineNumber: Number(lineNumber),
      column: Number(column),
    }))
}

/** The app's own frame: the first that Metro did not collapse and that is outside node_modules. */
export function appFrame(frames) {
  const frame = frames.find(
    one => !one.collapse && one.file?.startsWith('/') && !one.file.includes('/node_modules/'),
  )
  return frame ? { file: frame.file, line: frame.lineNumber } : null
}

// Base64 digits by character code, for reading the map's VLQ fields.
const DIGITS = new Int8Array(128)
;[...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].forEach((c, i) => {
  DIGITS[c.charCodeAt(0)] = i
})

/**
 * Reads one generated line of a map's mappings from `at`, calling `segment(column, source,
 * sourceLine)` for each mapped segment, and returns where the next line starts. `state` carries
 * the source and source line, which run on from one line to the next.
 */
function readLine(mappings, at, state, segment = () => {}) {
  let column = 0
  let field = 0
  let value = 0
  let shift = 0
  const end = () => {
    if (field >= 4) segment(column, state.source, state.line)
    field = 0
  }
  for (; at < mappings.length; at++) {
    const char = mappings[at]
    if (char === ';') {
      end()
      return at + 1
    }
    if (char === ',') {
      end()
      continue
    }
    const digit = DIGITS[mappings.charCodeAt(at)]
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
      continue
    }
    const delta = value & 1 ? -(value >>> 1) : value >>> 1
    if (field === 0) column += delta
    else if (field === 1) state.source += delta
    else if (field === 2) state.line += delta
    field++
    value = 0
    shift = 0
  }
  end()
  return at
}

/**
 * A source map (version 3) made ready for lookups. Only where each generated line starts, and the
 * source and source line it starts from, are kept; a lookup reads its one line.
 */
export function decodeMap({ sources, mappings, x_google_ignoreList = [] }) {
  const starts = [0]
  const sourceAt = [0]
  const lineAt = [0]
  const state = { source: 0, line: 0 }
  for (let at = 0; at < mappings.length; ) {
    at = readLine(mappings, at, state)
    starts.push(at)
    sourceAt.push(state.source)
    lineAt.push(state.line)
  }
  return { sources, mappings, ignored: new Set(x_google_ignoreList), starts, sourceAt, lineAt }
}

/** Where a bundle position (1-based line, 0-based column) came from, as /symbolicate would say it. */
export function originalPosition(map, line, column) {
  const index = line - 1
  if (index < 0 || index >= map.starts.length - 1) return null
  let found = null
  const state = { source: map.sourceAt[index], line: map.lineAt[index] }
  readLine(map.mappings, map.starts[index], state, (segmentColumn, source, sourceLine) => {
    if (segmentColumn <= column) found = { source, sourceLine }
  })
  if (found === null) return null
  return { file: map.sources[found.source], lineNumber: found.sourceLine + 1, collapse: map.ignored.has(found.source) }
}

async function fetchJson(url, init, timeout, fetchImpl) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeout) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

/**
 * The source map Metro serves beside a bundle: `.bundle` becomes `.map`, the options stay, and the
 * sources' text, which only the lookup's caller has, is left out.
 */
export async function bundleMap(bundleUrl, fetchImpl = fetch) {
  const url = new URL(bundleUrl)
  url.pathname = url.pathname.replace(/\.bundle(?=\/|$)/, '.map')
  // Expo Go passes the bundle's options in the path, after `//&`.
  if (url.pathname.includes('//&')) url.pathname += '&excludeSource=true'
  else url.searchParams.set('excludeSource', 'true')
  return decodeMap(await fetchJson(url.href, {}, 30_000, fetchImpl))
}

async function symbolicate(frames, fetchImpl) {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stack: frames }) }
  return (await fetchJson(`${new URL(frames[0].file).origin}/symbolicate`, init, 5000, fetchImpl)).stack ?? []
}

/** The frames in the app's sources: from a kept map when there is one for their bundle, else from Metro. */
async function locate(frames, maps, fetchImpl) {
  const kept = await Promise.all(
    frames.map(async frame => {
      const map = await maps.get(frame.file)
      return map ? (originalPosition(map, frame.lineNumber, frame.column) ?? {}) : null
    }),
  )
  const rest = frames.filter((_, index) => kept[index] === null)
  const answered = rest.length > 0 ? await symbolicate(rest, fetchImpl).catch(() => []) : []
  let next = 0
  return kept.map(frame => frame ?? answered[next++] ?? {})
}

/**
 * Where the pressed element's JSX is written (`source`) and where the components around it are
 * used (`usedAt`, nearest first): the first stack is the element's, the others its owners'. `maps`
 * holds the maps of the bundles apps launched with, or promises of them, by bundle URL.
 */
export async function sourcesFor(stacks, { maps = new Map(), fetchImpl = fetch } = {}) {
  const parsed = stacks.map(parseStack)
  // One lookup for every stack: one request to Metro at most.
  const located = await locate(parsed.flat(), maps, fetchImpl)
  let next = 0
  const found = parsed.map(frames => {
    const mine = located.slice(next, (next += frames.length))
    return frames.length === 0 ? null : appFrame(mine)
  })
  const [source = null, ...owners] = found
  const key = ({ file, line }) => `${file}:${line}`
  const seen = new Set(source ? [key(source)] : [])
  const usedAt = owners.filter(owner => owner !== null && !seen.has(key(owner)) && seen.add(key(owner)))
  return { source, usedAt }
}

/** The element the app named, with the sources found for it. */
export function withSources(element, located) {
  if (!element || !located) return element
  return {
    ...element,
    ...(located.source && { file: located.source.file, line: located.source.line }),
    ...(located.usedAt.length > 0 && { usedAt: located.usedAt }),
  }
}
