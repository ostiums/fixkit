// Turns the stacks a React Native app sends with a report into source lines, through the Metro
// server that bundled the app. In development React keeps, for every element, an Error whose stack
// shows where its JSX was written; Metro's /symbolicate maps the bundle's lines back to the app's
// files. No dependencies.

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

/**
 * Where the pressed element's JSX is written (`source`) and where the components around it are
 * used (`usedAt`, nearest first): the first stack is the element's, the others its owners'.
 */
export async function sourcesFor(stacks, fetchImpl = fetch) {
  const found = await Promise.all(
    stacks.map(async stack => {
      const frames = parseStack(stack)
      if (frames.length === 0) return null
      try {
        return appFrame(await symbolicate(frames, fetchImpl))
      } catch {
        return null
      }
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
