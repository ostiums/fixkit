import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hold, installHold, isHeld, release } from '../src/hold.ts'

/** Stands in for Pressability: records the signals it receives. */
class FakePressability {
  received: string[] = []
  _receiveSignal(signal: string, _event: unknown) {
    this.received.push(signal)
  }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('while held, the long press is dropped and the release ends the press without pressing', async () => {
  assert.equal(installHold(FakePressability.prototype as never), true)
  const pressable = new FakePressability()

  pressable._receiveSignal('RESPONDER_GRANT', {})
  hold()
  pressable._receiveSignal('LONG_PRESS_DETECTED', {})
  pressable._receiveSignal('RESPONDER_RELEASE', {})
  release()
  assert.equal(isHeld(), true)
  await tick()
  assert.equal(isHeld(), false)

  pressable._receiveSignal('RESPONDER_GRANT', {})
  pressable._receiveSignal('RESPONDER_RELEASE', {})

  assert.deepEqual(pressable.received, ['RESPONDER_GRANT', 'RESPONDER_TERMINATED', 'RESPONDER_GRANT', 'RESPONDER_RELEASE'])
})

test('installing twice wraps once; a missing class is reported, not thrown', () => {
  assert.equal(installHold(FakePressability.prototype as never), true)
  const pressable = new FakePressability()
  pressable._receiveSignal('RESPONDER_RELEASE', {})
  assert.deepEqual(pressable.received, ['RESPONDER_RELEASE'])

  assert.equal(installHold(undefined), false)
  assert.equal(installHold({} as never), false)
})
