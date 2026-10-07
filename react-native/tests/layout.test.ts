import assert from 'node:assert/strict'
import { test } from 'node:test'

import { around, dimAround, liftFor, spotlight } from '../src/layout.ts'

test('the app slides up only as far as keeps the element 28 pt above the composer', () => {
  assert.equal(liftFor(700, 600), 128)
  assert.equal(liftFor(300, 600), 0)
})

test('the spotlight is the frame with 6 pt around it, or a square around the touch, moved with the lift', () => {
  assert.deepEqual(spotlight({ x: 20, y: 100, width: 50, height: 20 }, { x: 0, y: 0 }, 30), { x: 14, y: 64, width: 62, height: 32 })
  assert.deepEqual(spotlight(null, { x: 100, y: 200 }, 0), { x: 72, y: 172, width: 56, height: 56 })
})

test('around a frame by a margin, or a square of a radius around the touch', () => {
  assert.deepEqual(around({ x: 20, y: 100, width: 50, height: 20 }, { x: 0, y: 0 }, 4, 22), { x: 16, y: 96, width: 58, height: 28 })
  assert.deepEqual(around(null, { x: 100, y: 200 }, 4, 22), { x: 78, y: 178, width: 44, height: 44 })
})

test('four dimmed rectangles cover the screen around the lit frame', () => {
  const dim = dimAround({ x: 10, y: 100, width: 50, height: 20 }, 400, 800)

  assert.deepEqual(dim, [
    { x: 0, y: 0, width: 400, height: 100 },
    { x: 0, y: 120, width: 400, height: 680 },
    { x: 0, y: 100, width: 10, height: 20 },
    { x: 60, y: 100, width: 340, height: 20 },
  ])
  const area = dim.reduce((sum, r) => sum + r.width * r.height, 0)
  assert.equal(area + 50 * 20, 400 * 800)
})
