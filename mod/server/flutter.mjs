// Hot reload for a Flutter app that `flutter run` runs. The app tells the receiver its VM service at
// launch; `flutter run` has put DDS in front of it and registered its own reloadSources and
// hotRestart services there, the ones DevTools' buttons call. Calling one makes `flutter run`
// compile the changed files and reload the app, which then says it launched.

export const NO_APP = 'No Flutter app with FixKit has launched in this session'
export const NOT_RUNNING = 'The Flutter app is not running: start it with flutter run'
export const NOT_FLUTTER_RUN = 'The app was not started by flutter run, which hot reloads it: start it with flutter run'
export const FAILED = 'The reload failed, most likely a compile error: run dart analyze on the changed files'
export const TOO_LONG = 'The reload took more than a minute: see flutter run'

/** The WebSocket of the app's DDS: the VM service redirects to it once `flutter run` attached. */
export async function ddsSocketUrl(vmService, fetchImpl = fetch, signal) {
  const base = vmService.endsWith('/') ? vmService : `${vmService}/`
  const answer = await fetchImpl(base, { redirect: 'manual', signal })
  const location = answer.status >= 300 && answer.status < 400 ? answer.headers.get('location') : null
  // Only the headers matter; an unread body keeps the connection open.
  await answer.body?.cancel()
  if (!location) return new URL('ws', base).href.replace(/^http/, 'ws')
  const moved = new URL(location, base)
  return (moved.searchParams.get('uri') ?? new URL('ws', moved).href).replace(/^http/, 'ws')
}

/**
 * JSON-RPC over an open socket, and `registered`: the method `flutter run` registered for
 * `service` on the Service stream, or null once `wait` ms pass without it.
 */
function rpcOver(socket, service, wait) {
  let count = 0
  const pending = new Map()
  let found = () => {}
  const registered = new Promise(resolve => {
    found = resolve
    setTimeout(() => resolve(null), wait).unref?.()
  })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(String(data))
    const event = message.params?.event
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(message.error) : resolve(message.result)
    } else if (message.method === 'streamNotify' && event?.kind === 'ServiceRegistered' && event.service === service) {
      found(event.method)
    }
  }
  // The app quit or flutter run stopped: every call still waiting fails at once.
  socket.onclose = () => {
    for (const { reject } of pending.values()) reject(new Error(NOT_RUNNING))
    pending.clear()
  }
  return {
    registered,
    call(method, params = {}) {
      const id = String(++count)
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    },
  }
}

const opened = socket =>
  new Promise((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(NOT_RUNNING))
    socket.onclose = () => reject(new Error(NOT_RUNNING))
  })

/** Hot reloads, or with `restart` hot restarts, the app whose VM service is `vmService`. */
export async function reload(vmService, { restart = false } = {}, { fetchImpl = fetch, WebSocketImpl = WebSocket, wait = 1000, deadline = 60_000 } = {}) {
  // All of it under the deadline: a suspended app accepts the connection and never answers.
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new Error(TOO_LONG)), deadline)
  const timedOut = new Promise((_, reject) => timeout.signal.addEventListener('abort', () => reject(timeout.signal.reason)))
  let socket = null
  const work = (async () => {
    const url = await ddsSocketUrl(vmService, fetchImpl, timeout.signal).catch(() => {
      throw new Error(NOT_RUNNING)
    })
    // The deadline passed while DDS was looked up: nothing is left to open a socket for.
    timeout.signal.throwIfAborted()
    socket = new WebSocketImpl(url)
    await opened(socket)
    const rpc = rpcOver(socket, restart ? 'hotRestart' : 'reloadSources', wait)
    const [{ isolates = [] }] = await Promise.all([rpc.call('getVM'), rpc.call('streamListen', { streamId: 'Service' }).catch(() => {})])
    const isolate = isolates.find(one => one.name === 'main') ?? isolates[0]
    const method = await rpc.registered
    if (!method || !isolate) throw new Error(NOT_FLUTTER_RUN)
    const result = await rpc.call(method, { isolateId: isolate.id }).catch(error => {
      if (error instanceof Error && error.message === NOT_RUNNING) throw error
      throw new Error(error?.message ? `${FAILED}: ${error.message}` : FAILED)
    })
    if (result?.success === false) throw new Error(FAILED)
  })()
  try {
    await Promise.race([work, timedOut])
  } finally {
    clearTimeout(timer)
    socket?.close()
  }
}
