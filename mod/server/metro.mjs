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

const DIGITS = new Map([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]))

/**
 * A source map (version 3) made ready for lookups: per generated line, its segments as
 * [column, source, source line], both 0-based, in column order.
 */
export function decodeMap({ sources, mappings, x_google_ignoreList = [] }) {
  const lines = [[]]
  let column = 0
  let source = 0
  let sourceLine = 0
  let sourceColumn = 0
  let fields = []
  let value = 0
  let shift = 0
  const finish = () => {
    if (fields.length === 0) return
    column += fields[0]
    if (fields.length >= 4) {
      source += fields[1]
      sourceLine += fields[2]
      sourceColumn += fields[3]
      lines.at(-1).push([column, source, sourceLine])
    }
    fields = []
  }
  for (const char of mappings) {
    if (char === ';') {
      finish()
      lines.push([])
      column = 0
    } else if (char === ',') {
      finish()
    } else {
      const digit = DIGITS.get(char)
      value += (digit & 31) << shift
      if (digit & 32) {
        shift += 5
      } else {
        fields.push(value & 1 ? -(value >>> 1) : value >>> 1)
        value = 0
        shift = 0
      }
    }
  }
  finish()
  return { sources, ignored: new Set(x_google_ignoreList), lines }
}

/** Where a bundle position (1-based line, 0-based column) came from, as /symbolicate would say it. */
export function originalPosition(map, line, column) {
  let found = null
  for (const segment of map.lines[line - 1] ?? []) {
    if (segment[0] > column) break
    found = segment
  }
  if (found === null) return null
  return { file: map.sources[found[1]], lineNumber: found[2] + 1, collapse: map.ignored.has(found[1]) }
}

/** The source map Metro serves beside a bundle: `.bundle` becomes `.map`, the rest stays. */
export async function bundleMap(bundleUrl, fetchImpl = fetch) {
  const url = new URL(bundleUrl)
  url.pathname = url.pathname.replace(/\.bundle(?=\/|$)/, '.map')
  const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`source map answered ${response.status}`)
  return decodeMap(await response.json())
}

async function symbolicate(frames, fetchImpl) {
  const response = await fetchImpl(`${new URL(frames[0].file).origin}/symbolicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stack: frames }),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`symbolicate answered ${response.status}`)
  return (await response.json()).stack ?? []
}

/** The frames in the app's sources: from a kept map when there is one for their bundle, else from Metro. */
async function locate(frames, fetchImpl, maps) {
  const kept = frames.map(frame => {
    const map = maps.get(frame.file)
    return map ? (originalPosition(map, frame.lineNumber, frame.column) ?? {}) : null
  })
  const rest = frames.filter((_, index) => kept[index] === null)
  const answered = rest.length > 0 ? await symbolicate(rest, fetchImpl).catch(() => []) : []
  let next = 0
  return kept.map(frame => frame ?? answered[next++] ?? {})
}

/**
 * Where the pressed element's JSX is written (`source`) and where the components around it are
 * used (`usedAt`, nearest first): the first stack is the element's, the others its owners'.
 * `maps` holds the decoded maps of the bundles apps launched with, by bundle URL.
 */
export async function sourcesFor(stacks, fetchImpl = fetch, maps = new Map()) {
  const found = await Promise.all(
    stacks.map(async stack => {
      const frames = parseStack(stack)
      return frames.length === 0 ? null : appFrame(await locate(frames, fetchImpl, maps))
    }),
  )
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
