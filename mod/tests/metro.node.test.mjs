// node --test mod/tests/*.node.test.mjs: React Native stacks turned into source lines through a stand-in for Metro.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { appFrame, bundleMap, decodeMap, originalPosition, parseStack, sourcesFor, withSources } from '../server/metro.mjs'

const BUNDLE = 'http://127.0.0.1:8081/index.ts.bundle//&platform=ios&dev=true'
const stack = (...frames) => ['Error: react-stack-top-frame', ...frames].join('\n')
const at = (name, line) => `    at ${name} (${BUNDLE}:${line}:47)`

// What Metro answers for each bundle line: the files a spike app's stacks mapped to.
const MAP = {
  11129: { file: '/app/node_modules/react/cjs/react-jsx-dev-runtime.js', lineNumber: 1, collapse: true },
  93021: { file: '/app/src/WalletCard.tsx', lineNumber: 18 },
  93059: { file: '/app/App.tsx', lineNumber: 31 },
  92481: { file: '/app/node_modules/expo/src/launch/withDevTools.ios.tsx', lineNumber: 32, collapse: true },
}

function metro({ fail = false } = {}) {
  const asked = []
  const fetchImpl = async (url, init) => {
    asked.push(url)
    if (fail) throw new Error('connect ECONNREFUSED')
    const { stack } = JSON.parse(init.body)
    return { ok: true, json: async () => ({ stack: stack.map(f => ({ ...f, ...MAP[f.lineNumber] })) }) }
  }
  return { asked, fetchImpl }
}

test('a stack keeps only the bundle frames', () => {
  const frames = parseStack(stack('    at RCTText (<anonymous>)', at('anonymous', 11129), '    at run (native)', at('WalletCard', 93021)))

  assert.deepEqual(frames.map(f => [f.methodName, f.lineNumber, f.column]), [
    ['anonymous', 11129, 47],
    ['WalletCard', 93021, 47],
  ])
  assert.equal(frames[0].file, BUNDLE)
})

test("the app's frame is the first Metro did not collapse and outside node_modules", () => {
  assert.deepEqual(
    appFrame([
      { file: '/app/node_modules/react/x.js', lineNumber: 1, collapse: true },
      { file: '/app/node_modules/lib/y.js', lineNumber: 2 },
      { file: '/app/src/WalletCard.tsx', lineNumber: 18 },
    ]),
    { file: '/app/src/WalletCard.tsx', line: 18 },
  )
  assert.equal(appFrame([{ file: '/app/node_modules/react/x.js', lineNumber: 1, collapse: true }]), null)
})

test("the element's line comes first, its owners' uses after, from the bundle's own Metro", async () => {
  const { asked, fetchImpl } = metro()
  const found = await sourcesFor(
    [
      stack(at('anonymous', 11129), at('WalletCard', 93021)),
      stack(at('anonymous', 11129), at('App', 93059)),
      stack(at('anonymous', 11129), at('withDevTools(App)', 92481)),
    ],
    fetchImpl,
  )

  assert.deepEqual(found, {
    source: { file: '/app/src/WalletCard.tsx', line: 18 },
    usedAt: [{ file: '/app/App.tsx', line: 31 }],
  })
  assert.deepEqual(new Set(asked), new Set(['http://127.0.0.1:8081/symbolicate']))
})

test('an owner on the same line as the element is not repeated', async () => {
  const { fetchImpl } = metro()
  const found = await sourcesFor([stack(at('App', 93059)), stack(at('App', 93059))], fetchImpl)

  assert.deepEqual(found, { source: { file: '/app/App.tsx', line: 31 }, usedAt: [] })
})

test('without Metro there is no source, and no error', async () => {
  const { fetchImpl } = metro({ fail: true })

  assert.deepEqual(await sourcesFor([stack(at('WalletCard', 93021))], fetchImpl), { source: null, usedAt: [] })
})

test('sources join the element the app named', () => {
  const element = { name: 'WalletCard › Text', frame: { x: 1, y: 2, width: 3, height: 4 } }

  assert.deepEqual(withSources(element, { source: { file: '/a.tsx', line: 3 }, usedAt: [{ file: '/b.tsx', line: 9 }] }), {
    ...element,
    file: '/a.tsx',
    line: 3,
    usedAt: [{ file: '/b.tsx', line: 9 }],
  })
  assert.equal(withSources(element, null), element)
  assert.equal(withSources(undefined, { source: { file: '/a.tsx', line: 3 }, usedAt: [] }), undefined)
  assert.deepEqual(withSources(element, { source: null, usedAt: [] }), element)
})

// Line 1 maps column 0 to a.tsx:1; line 2 maps column 0 to a.tsx:2 and column 4 to b.tsx:11, which is ignored.
const MAP_JSON = {
  version: 3,
  sources: ['/app/a.tsx', '/app/node_modules/b.js'],
  x_google_ignoreList: [1],
  names: [],
  mappings: 'AAAA;AACA,ICSA',
}

test('a source map decodes into original lines, ignored sources collapsed', () => {
  const map = decodeMap(MAP_JSON)

  assert.deepEqual(originalPosition(map, 1, 0), { file: '/app/a.tsx', lineNumber: 1, collapse: false })
  assert.deepEqual(originalPosition(map, 2, 2), { file: '/app/a.tsx', lineNumber: 2, collapse: false })
  assert.deepEqual(originalPosition(map, 2, 9), { file: '/app/node_modules/b.js', lineNumber: 11, collapse: true })
  assert.equal(originalPosition(map, 7, 0), null)
})

test("the bundle's own map is fetched from beside it, with the query kept", async () => {
  const asked = []
  const fetchImpl = async url => {
    asked.push(url)
    return { ok: true, json: async () => MAP_JSON }
  }
  await bundleMap('http://127.0.0.1:8081/index.bundle?platform=ios&dev=true', fetchImpl)
  await bundleMap('http://127.0.0.1:8081/index.ts.bundle//&platform=ios&dev=true', fetchImpl)

  assert.deepEqual(asked, [
    'http://127.0.0.1:8081/index.map?platform=ios&dev=true',
    'http://127.0.0.1:8081/index.ts.map//&platform=ios&dev=true',
  ])
})

test('frames of a bundle whose map was kept at launch are read from that map, the others from Metro', async () => {
  // After a Fast Refresh Metro answers for the bundle as it is now, which can be lines away from the
  // code the app still runs; the map kept at launch matches it.
  const { asked, fetchImpl } = metro()
  const kept = 'http://127.0.0.1:8081/kept.bundle'
  const maps = new Map([[kept, decodeMap(MAP_JSON)]])
  const found = await sourcesFor(
    [stack(`    at Card (${kept}:2:3)`), stack(at('App', 93059))],
    fetchImpl,
    maps,
  )

  assert.deepEqual(found, { source: { file: '/app/a.tsx', line: 2 }, usedAt: [{ file: '/app/App.tsx', line: 31 }] })
  assert.equal(asked.length, 1)
})
