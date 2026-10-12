// node --test mod/tests/*.node.test.mjs: finding a Flutter app's DDS and hot reloading it.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FAILED, NOT_FLUTTER_RUN, NOT_RUNNING, TOO_LONG, ddsSocketUrl, reload } from '../server/flutter.mjs'

const VM = 'http://127.0.0.1:50335/07j_NgzC9Kk=/'
const DDS_WS = 'ws://127.0.0.1:50340/MC0YBJgP2js=/ws'

/** A fetch that answers the VM service's root as `flutter run` leaves it, behind DDS. */
const behindDds = async (url, init) => {
  assert.equal(url, VM)
  assert.equal(init.redirect, 'manual')
  const location = `http://127.0.0.1:50340/MC0YBJgP2js=/devtools/?uri=${encodeURIComponent(DDS_WS)}`
  return new Response(null, { status: 302, headers: { location } })
}

/** A VM service over a fake WebSocket: `services` are registered by flutter run, `answer` answers a call to one. */
function fakeSocket({ services = ['reloadSources', 'hotRestart'], answer = () => ({ result: { type: 'Success' } }), closeOn = null } = {}) {
  const calls = []
  class FakeSocket {
    constructor(url) {
      this.url = url
      setTimeout(() => this.onopen?.(), 0)
    }
    send(text) {
      const { id, method, params } = JSON.parse(text)
      calls.push({ url: this.url, method, params })
      if (method === closeOn) return setTimeout(() => this.onclose?.(), 0)
      const reply = body => setTimeout(() => this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, ...body }) }), 0)
      if (method === 'getVM') return reply({ result: { isolates: [{ id: 'isolates/1', name: 'main' }] } })
      if (method === 'streamListen') {
        reply({ result: { type: 'Success' } })
        for (const service of services) {
          const event = { kind: 'ServiceRegistered', service, method: `s1.${service}`, alias: 'Flutter Tools' }
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method: 'streamNotify', params: { streamId: 'Service', event } }) }), 0)
        }
        return
      }
      reply(answer(method))
    }
    close() {}
  }
  return { FakeSocket, calls }
}

test("DDS's socket is the one the VM service redirects to", async () => {
  assert.equal(await ddsSocketUrl(VM, behindDds), DDS_WS)
})

test('a redirect without a uri parameter leads to the socket at its location', async () => {
  const fetchImpl = async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:50340/abc=/' } })
  assert.equal(await ddsSocketUrl(VM, fetchImpl), 'ws://127.0.0.1:50340/abc=/ws')
})

test('without DDS the VM service itself', async () => {
  assert.equal(await ddsSocketUrl(VM, async () => new Response('{}', { status: 200 })), 'ws://127.0.0.1:50335/07j_NgzC9Kk=/ws')
})

test('a reload calls the reloadSources that flutter run registered, on the main isolate', async () => {
  const { FakeSocket, calls } = fakeSocket()
  await reload(VM, {}, { fetchImpl: behindDds, WebSocketImpl: FakeSocket })
  const last = calls.at(-1)
  assert.equal(last.url, DDS_WS)
  assert.equal(last.method, 's1.reloadSources')
  assert.deepEqual(last.params, { isolateId: 'isolates/1' })
})

test('a restart calls hotRestart', async () => {
  const { FakeSocket, calls } = fakeSocket()
  await reload(VM, { restart: true }, { fetchImpl: behindDds, WebSocketImpl: FakeSocket })
  assert.equal(calls.at(-1).method, 's1.hotRestart')
})

test('a failed reload, a compile error most likely, says to analyze', async () => {
  const { FakeSocket } = fakeSocket({ answer: () => ({ error: { code: -32603, message: '' } }) })
  await assert.rejects(reload(VM, {}, { fetchImpl: behindDds, WebSocketImpl: FakeSocket }), { message: FAILED })
})

test('an app not run by flutter run has no reload service', async () => {
  const { FakeSocket } = fakeSocket({ services: [] })
  await assert.rejects(reload(VM, {}, { fetchImpl: behindDds, WebSocketImpl: FakeSocket, wait: 50 }), { message: NOT_FLUTTER_RUN })
})

test('an app that is gone is not running', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed')
  }
  await assert.rejects(reload(VM, {}, { fetchImpl }), { message: NOT_RUNNING })
})

test('an app that quits during the reload is not running, at once', async () => {
  const { FakeSocket } = fakeSocket({ closeOn: 's1.reloadSources' })
  const started = Date.now()
  await assert.rejects(reload(VM, {}, { fetchImpl: behindDds, WebSocketImpl: FakeSocket, deadline: 5000 }), { message: NOT_RUNNING })
  assert.ok(Date.now() - started < 1000)
})

test('an app that accepts the connection and never answers is cut off at the deadline', async () => {
  // A suspended app: the simulator's kernel accepts, nothing replies.
  let lookup
  const fetchImpl = (_url, init) => {
    lookup = init.signal
    return new Promise(() => {})
  }
  await assert.rejects(reload(VM, {}, { fetchImpl, deadline: 50 }), { message: TOO_LONG })
  assert.equal(lookup.aborted, true)
})
