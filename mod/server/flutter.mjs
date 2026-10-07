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
export async function ddsSocketUrl(vmService, fetchImpl = fetch) {
  const base = vmService.endsWith('/') ? vmService : `${vmService}/`
  const answer = await fetchImpl(base, { redirect: 'manual' })
  const location = answer.status >= 300 && answer.status < 400 ? answer.headers.get('location') : null
  if (!location) return new URL('ws', base).href.replace(/^http/, 'ws')
  const moved = new URL(location, base)
  return (moved.searchParams.get('uri') ?? new URL('ws', moved).href).replace(/^http/, 'ws')
}

/** JSON-RPC over an open socket: calls, and the services registered on the Service stream. */
function rpcOver(socket) {
  let count = 0
  const pending = new Map()
  const services = new Map()
  const listeners = new Set()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(String(data))
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(message.error) : resolve(message.result)
    } else if (message.method === 'streamNotify' && message.params?.event?.kind === 'ServiceRegistered') {
      services.set(message.params.event.service, message.params.event.method)
      listeners.forEach(listener => listener())
    }
  }
  return {
    call(method, params = {}) {
      const id = String(++count)
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    },
    /** The method `flutter run` registered for `service`, or null once `wait` ms pass without it. */
    service(service, wait) {
      if (services.has(service)) return Promise.resolve(services.get(service))
      return new Promise(resolve => {
        const listener = () => {
          if (!services.has(service)) return
          done(services.get(service))
        }
        const done = method => {
          listeners.delete(listener)
          clearTimeout(timer)
          resolve(method)
        }
        const timer = setTimeout(() => done(null), wait)
        listeners.add(listener)
      })
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
  let url
  try {
    url = await ddsSocketUrl(vmService, fetchImpl)
  } catch {
    throw new Error(NOT_RUNNING)
  }
  const socket = new WebSocketImpl(url)
  let timer
  const work = (async () => {
    await opened(socket)
    const rpc = rpcOver(socket)
    const { isolates = [] } = await rpc.call('getVM')
    const isolate = isolates.find(one => one.name === 'main') ?? isolates[0]
    await rpc.call('streamListen', { streamId: 'Service' }).catch(() => {})
    const method = await rpc.service(restart ? 'hotRestart' : 'reloadSources', wait)
    if (!method || !isolate) throw new Error(NOT_FLUTTER_RUN)
    const result = await rpc.call(method, { isolateId: isolate.id }).catch(error => {
      throw new Error(error?.message ? `${FAILED}: ${error.message}` : FAILED)
    })
    if (result?.success === false) throw new Error(FAILED)
  })()
  try {
    await Promise.race([work, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(TOO_LONG)), deadline)))])
  } finally {
    clearTimeout(timer)
    socket.close()
  }
}
