// node --test mod/tests/*.node.test.mjs: Android's accessibility tree, as uiautomator dumps it, read by the lookup.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { elementAt } from '../server/inspect.mjs'
import { parseHierarchy } from '../server/uiautomator.mjs'

/** A uiautomator node; `inner` holds its children. */
const node = (attributes, inner = '') => {
  const all = { text: '', 'resource-id': '', class: 'android.view.View', 'content-desc': '', bounds: '[0,0][0,0]', ...attributes }
  const written = Object.entries(all)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ')
  return inner ? `<node ${written}>${inner}</node>` : `<node ${written} />`
}
const dump = inner =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">${node({ class: 'android.widget.FrameLayout', bounds: '[0,0][1080,2400]' }, inner)}</hierarchy>`

test('a text in pixels comes back in the touch’s units', () => {
  const tree = parseHierarchy(dump(node({ class: 'android.widget.TextView', text: '€12,480.50', bounds: '[42,525][578,651]' })), 2.625)
  const [text] = tree[0].children

  assert.equal(text.type, 'TextView')
  assert.equal(text.AXLabel, '€12,480.50')
  assert.deepEqual(
    Object.fromEntries(Object.entries(text.frame).map(([key, value]) => [key, Math.round(value * 100) / 100])),
    { x: 16, y: 200, width: 204.19, height: 48 },
  )
})

test('a description is the label; a text beside one is the value', () => {
  const tree = parseHierarchy(
    dump(node({ 'content-desc': 'Send', bounds: '[0,0][10,10]' }) + node({ 'content-desc': 'Balance', text: '€5', bounds: '[0,10][10,20]' })),
    1,
  )
  const [send, balance] = tree[0].children

  assert.deepEqual([send.AXLabel, send.AXValue], ['Send', null])
  assert.deepEqual([balance.AXLabel, balance.AXValue], ['Balance', '€5'])
})

test("an app's own identifier is the id, so FixKit's own banner is never what was pressed", () => {
  const banner = node(
    { 'resource-id': 'fixkit.banner', bounds: '[0,0][1080,200]' },
    node({ class: 'android.widget.TextView', text: 'Sent to Claude Code', bounds: '[100,50][900,150]' }),
  )
  const tree = parseHierarchy(dump(banner), 1)

  assert.equal(tree[0].children[0].AXUniqueId, 'fixkit.banner')
  assert.equal(elementAt(tree, { x: 500, y: 100 }), null)
})

test('entities in attributes are read', () => {
  const tree = parseHierarchy(dump(node({ text: 'Tom &amp; Jerry &#x20AC;&#33; &quot;x&quot; &lt;&gt;&apos;', bounds: '[0,0][1,1]' })), 1)

  assert.equal(tree[0].children[0].AXLabel, 'Tom & Jerry €! "x" <>\'')
})

test('the lookup finds a nested text and the labels in its row', () => {
  const row = node(
    { class: 'android.view.ViewGroup', bounds: '[0,100][1080,200]' },
    node({ class: 'android.widget.TextView', text: 'Northwind GmbH', bounds: '[20,120][500,180]' }) +
      node({ class: 'android.widget.TextView', text: '+€4,650.00', bounds: '[700,120][1060,180]' }),
  )
  const found = elementAt(parseHierarchy(dump(row), 1), { x: 800, y: 150 })

  assert.deepEqual([found.element.type, found.element.label], ['TextView', '+€4,650.00'])
  assert.deepEqual(found.nearby, ['Northwind GmbH'])
})

test("the ids of Android's layouts name nothing: the content frame is no control around anything", () => {
  const tree = parseHierarchy(
    dump(
      node(
        { 'resource-id': 'android:id/content', bounds: '[0,0][1080,2400]' },
        node({ 'resource-id': 'com.fixkit.example:id/action_bar_root', bounds: '[0,0][1080,2400]' }, node({ text: 'Hi', bounds: '[0,0][100,100]' })),
      ),
    ),
    1,
  )
  const content = tree[0].children[0]

  assert.deepEqual([content.AXUniqueId, content.children[0].AXUniqueId], [null, null])
  assert.equal(elementAt(tree, { x: 50, y: 50 }).within, null)
})

test("in a window under the status bar, frames are measured from the app's content, as its touch is", () => {
  const tree = parseHierarchy(
    `<?xml version='1.0' ?><hierarchy rotation="0">${node(
      { class: 'android.widget.FrameLayout', bounds: '[0,0][1080,2400]' },
      node({ 'resource-id': 'android:id/content', bounds: '[0,63][1080,2400]' }, node({ text: 'Hi', bounds: '[0,103][200,143]' })),
    )}</hierarchy>`,
    1,
  )

  assert.equal(elementAt(tree, { x: 50, y: 60 })?.element.label, 'Hi')
})

// Dumped from react-native/example on a Pixel 8 emulator (2.625 pixels a point).
const rnScreen = parseHierarchy(readFileSync(new URL('./fixtures/android-rn.xml', import.meta.url), 'utf8'), 2.625)

test("a React Native text comes with the labels in its row and nothing of Android's around it", () => {
  const found = elementAt(rnScreen, { x: 89, y: 273 })

  assert.deepEqual([found.element.type, found.element.label], ['TextView', 'Alex Morgan'])
  assert.equal(found.within, null)
  assert.ok(found.nearby.includes('•••• 4021'))
})

test("a React Native testID is the element's identifier", () => {
  const found = elementAt(rnScreen, { x: 78, y: 350 })

  assert.equal(found.element.label, 'Send')
  assert.equal(found.within.identifier, 'quickActions.Send')
})

// Dumped from flutter/example on a Pixel 8 emulator (2.625 pixels a point), the banner of a queued report on screen.
const flutterScreen = parseHierarchy(readFileSync(new URL('./fixtures/android-flutter.xml', import.meta.url), 'utf8'), 2.625)

test("a Flutter card's semantics name the balance pressed in it, with nothing of Android's around it", () => {
  const found = elementAt(flutterScreen, { x: 131, y: 208 })

  assert.equal(found.element.type, 'View')
  assert.ok(found.element.label.includes('€12,480.50'))
  assert.equal(found.within, null)
})

test("FixKit's banner on a Flutter screen is never what was pressed", () => {
  assert.notEqual(elementAt(flutterScreen, { x: 200, y: 75 })?.element.label, 'Queued in Claude Code')
})

test('a failed dump, a tree with nothing named and the line adb adds after it', () => {
  assert.equal(parseHierarchy('ERROR: could not get idle state.\n', 1), null)
  assert.equal(parseHierarchy(dump(''), 1), null)

  const tree = parseHierarchy(`${dump(node({ text: 'Hi', bounds: '[0,0][1,1]' }))}UI hierchary dumped to: /dev/tty\n`, 1)
  assert.equal(tree[0].children[0].AXLabel, 'Hi')
})
