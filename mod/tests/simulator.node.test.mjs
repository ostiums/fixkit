// node --test mod/tests/*.node.test.mjs: which simulator a report that names none came from.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pickSimulator } from '../server/simulator.mjs'

const device = (udid, state = 'Booted') => ({ udid, state, name: udid })
const list = devices => ({ devices })

test('the one simulator booted on the app’s iOS version', () => {
  const found = pickSimulator(
    list({
      'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [device('A'), device('B', 'Shutdown')],
      'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [device('C')],
    }),
    '27.0',
  )

  assert.deepEqual(found, { udid: 'A', booted: 1 })
})

test('a patch version names its runtime by major and minor', () => {
  const found = pickSimulator(list({ 'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [device('A')] }), '18.0.1')

  assert.equal(found.udid, 'A')
})

test('two booted on the same version leave it unknown', () => {
  const found = pickSimulator(list({ 'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [device('A'), device('B')] }), '27.0')

  assert.deepEqual(found, { udid: null, booted: 2 })
})

test('without a version, the only booted simulator', () => {
  assert.equal(pickSimulator(list({ 'x.iOS-27-0': [device('A')], 'x.iOS-26-5': [] })).udid, 'A')
  assert.equal(pickSimulator(list({})).udid, null)
})
