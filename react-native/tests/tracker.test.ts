import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PressTracker } from '../src/tracker.ts'

/** Timers the test moves by hand. */
function clock() {
  let now = 0
  let timers: { at: number; run: () => void; id: number }[] = []
  let next = 1
  return {
    set: (run: () => void, ms: number) => {
      timers.push({ at: now + ms, run, id: next })
      return next++
    },
    clear: (id: unknown) => {
      timers = timers.filter(timer => timer.id !== id)
    },
    advance(ms: number) {
      now += ms
      const due = timers.filter(timer => timer.at <= now)
      timers = timers.filter(timer => timer.at > now)
      due.forEach(timer => timer.run())
    },
  }
}

test('one finger held 450 ms fires once, where it landed', () => {
  const timers = clock()
  const fired: { x: number; y: number }[] = []
  const tracker = new PressTracker(point => fired.push(point), timers)

  tracker.start({ x: 100, y: 200 }, 1)
  timers.advance(449)
  assert.equal(fired.length, 0)
  timers.advance(1)
  assert.deepEqual(fired, [{ x: 100, y: 200 }])
  timers.advance(1000)
  assert.equal(fired.length, 1)
})

test('lifting, moving away or a second finger is no long press', () => {
  const timers = clock()
  const fired: unknown[] = []
  const tracker = new PressTracker(point => fired.push(point), timers)

  tracker.start({ x: 0, y: 0 }, 1)
  tracker.stop()
  timers.advance(500)

  tracker.start({ x: 0, y: 0 }, 1)
  tracker.move({ x: 8, y: 6 })
  tracker.move({ x: 11, y: 0 })
  timers.advance(500)

  tracker.start({ x: 0, y: 0 }, 2)
  timers.advance(500)

  assert.equal(fired.length, 0)
})

test('a small tremor keeps the press', () => {
  const timers = clock()
  const fired: unknown[] = []
  const tracker = new PressTracker(point => fired.push(point), timers)

  tracker.start({ x: 0, y: 0 }, 1)
  tracker.move({ x: 6, y: 6 })
  timers.advance(450)
  assert.equal(fired.length, 1)
})
