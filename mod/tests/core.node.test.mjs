// node --test mod/tests/*.node.test.mjs: the harness-agnostic core, as plain Node loads it.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildEnded, finished, isActive } from '../core/fixes.mjs'
import { isBuildAndRun, isReactNativeProject, promptFor } from '../core/prompt.mjs'

test('a build that ends without a launch goes back to fixing', () => {
  assert.equal(buildEnded('rebuilding'), 'fixing')
  assert.equal(buildEnded('live'), 'live')
})

test('a fix is live only when its turn answered after a launch', () => {
  assert.equal(finished('live', true), 'live')
  assert.equal(finished('live', false), 'stopped')
  assert.equal(finished('fixing', true), 'stopped')
})

test('a report is active until it is live or stopped', () => {
  assert.deepEqual(
    ['queued', 'fixing', 'rebuilding', 'live', 'stopped'].map(isActive),
    [true, true, true, false, false],
  )
})

test('the prompt module runs in plain Node', () => {
  const prompt = promptFor(
    {
      id: 'r1',
      comment: 'Shifted',
      screen: 'Home',
      screenshot: '.fixkit/reports/r1.png',
      element: { name: 'home.send' },
    },
    'App/Home.swift:8',
  )

  assert.equal(prompt, 'Shifted\n\n[fix r1] home.send · App/Home.swift:8 · .fixkit/reports/r1.png')
  assert.equal(isReactNativeProject(null), false)
  assert.ok(isBuildAndRun('mcp__XcodeBuildMCP__build_run_sim'))
})
