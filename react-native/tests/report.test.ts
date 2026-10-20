import assert from 'node:assert/strict'
import { test } from 'node:test'

import { composerBottom } from '../src/layout.ts'
import { reportBody } from '../src/report.ts'

const iPhone = { os: '27.0', platform: 'ios', pixelRatio: 3 } as const
const pixel = { os: '36', platform: 'android', pixelRatio: 2.625 } as const

test('the body carries the iOS version, rounded points and the stacks', () => {
  const body = reportBody(
    { touch: { x: 100.4, y: 309.6 }, element: { name: 'WalletCard › Text', frame: { x: 44.2, y: 299, width: 314, height: 21.6 } }, stacks: ['Error: a', 'Error: b'] },
    'The name is cut off',
    iPhone,
  )

  assert.deepEqual(body, {
    os: '27.0',
    platform: 'ios',
    comment: 'The name is cut off',
    screen: '',
    touch: { x: 100, y: 310 },
    element: { name: 'WalletCard › Text', frame: { x: 44, y: 299, width: 314, height: 22 } },
    stacks: ['Error: a', 'Error: b'],
  })
})

test("on Android the body carries the API level and the pixel ratio the receiver reads the screen's pixels with", () => {
  const body = reportBody({ touch: { x: 1, y: 2 }, element: null, stacks: [] }, 'Too dark', pixel)

  assert.deepEqual(body, { os: '36', platform: 'android', pixelRatio: 2.625, comment: 'Too dark', screen: '', touch: { x: 1, y: 2 } })
})

test('nothing found sends the touch alone', () => {
  assert.deepEqual(reportBody({ touch: { x: 1, y: 2 }, element: null, stacks: [] }, 'Too dark', iPhone), {
    os: '27.0',
    platform: 'ios',
    comment: 'Too dark',
    screen: '',
    touch: { x: 1, y: 2 },
  })
})

test('an element without a frame keeps its name, and an empty first stack keeps its place', () => {
  const body = reportBody(
    { touch: { x: 1, y: 2 }, element: { name: 'Card › Text', frame: null }, stacks: ['', 'Error: owner'] },
    'Too dark',
    iPhone,
  )

  assert.deepEqual(body.element, { name: 'Card › Text' })
  // The first stack is the element's own; an owner's must not take its place.
  assert.deepEqual(body.stacks, ['', 'Error: owner'])
  assert.equal('stacks' in reportBody({ touch: { x: 1, y: 2 }, element: null, stacks: [''] }, 'x', iPhone), false)
})

test("the composer sits above the keyboard, and on Android above the navigation bar when there's none", () => {
  assert.equal(composerBottom(300, 'ios'), 310)
  assert.equal(composerBottom(0, 'ios'), 10)
  assert.equal(composerBottom(300, 'android'), 310)
  assert.equal(composerBottom(0, 'android'), 58)
})
