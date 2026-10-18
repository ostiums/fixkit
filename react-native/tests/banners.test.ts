import assert from 'node:assert/strict'
import { test } from 'node:test'

import { agentOf, bannerFor, composerHint, offline, sentTo } from '../src/banners.ts'

test('sent and offline banners name the agent', () => {
  assert.equal(sentTo('Claude Code').text, 'Sent to Claude Code')
  assert.equal(sentTo('Codex').text, 'Sent to Codex')
  assert.equal(offline('Codex').text, 'Codex is not listening')
  assert.equal(offline('Claude Code').glyph, '!')
})

test('offline before any answer names no agent', () => {
  assert.equal(offline(null).text, 'No agent is listening')
  assert.equal(offline(null).working, false)
})

test('each status names the agent where it speaks of one', () => {
  for (const agent of ['Claude Code', 'Codex']) {
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

test('the composer asks for the agent last heard from, else for no one', () => {
  assert.equal(composerHint('Codex'), 'What should Codex fix here?')
  assert.equal(composerHint(null), 'What needs fixing here?')
})
