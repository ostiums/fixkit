import assert from 'node:assert/strict'
import { test } from 'node:test'

import { OFFLINE, agentOf, bannerFor, sentTo } from '../src/banners.ts'

test('a receiver that does not answer cannot name its agent', () => {
  assert.deepEqual(OFFLINE, { text: 'FixKit is not listening', glyph: '!', working: false })
})

test('each status names the agent where it speaks of one', () => {
  for (const agent of ['Claude Code', 'Codex']) {
    assert.deepEqual(sentTo(agent), { text: `Sent to ${agent}`, glyph: null, working: true })
    assert.deepEqual(bannerFor('queued', agent), { text: `Queued in ${agent}`, glyph: null, working: true })
    assert.deepEqual(bannerFor('fixing', agent), { text: `${agent} is fixing it`, glyph: null, working: true })
    assert.deepEqual(bannerFor('live', agent), { text: `Fixed by ${agent}`, glyph: '✓', working: false })
    assert.deepEqual(bannerFor('stopped', agent), { text: `Not applied: see ${agent}`, glyph: '✕', working: false })
  }
  assert.equal(bannerFor('rebuilding', 'Codex').text, 'Rebuilding the app')
  assert.equal(bannerFor('anything else', 'Codex').text, 'Queued in Codex')
})

test('an answer without an agent comes from an older receiver: Claude Code', () => {
  assert.equal(agentOf({ agent: 'Codex' }), 'Codex')
  assert.equal(agentOf({}), 'Claude Code')
})
