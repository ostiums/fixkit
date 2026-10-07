// node --test mod/tests/*.node.test.mjs: the harness-agnostic core, as plain Node loads it.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isBuildAndRun, isReactNativeProject, promptFor } from '../core/prompt.mjs'

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
