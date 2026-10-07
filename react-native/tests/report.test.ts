import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bannerFor } from '../src/banners.ts'
import { reportBody } from '../src/report.ts'

test('the body carries the iOS version, rounded points and the stacks', () => {
  const body = reportBody(
    { touch: { x: 100.4, y: 309.6 }, element: { name: 'WalletCard › Text', frame: { x: 44.2, y: 299, width: 314, height: 21.6 } }, stacks: ['Error: a', 'Error: b'] },
    'The name is cut off',
    '27.0',
  )

  assert.deepEqual(body, {
    os: '27.0',
    comment: 'The name is cut off',
    screen: '',
    touch: { x: 100, y: 310 },
    element: { name: 'WalletCard › Text', frame: { x: 44, y: 299, width: 314, height: 22 } },
    stacks: ['Error: a', 'Error: b'],
  })
})

test('nothing found sends the touch alone', () => {
  assert.deepEqual(reportBody({ touch: { x: 1, y: 2 }, element: null, stacks: [] }, 'Too dark', '27.0'), {
    os: '27.0',
    comment: 'Too dark',
    screen: '',
    touch: { x: 1, y: 2 },
  })
})

test('an element without a frame keeps its name, and an empty first stack keeps its place', () => {
  const body = reportBody(
    { touch: { x: 1, y: 2 }, element: { name: 'Card › Text', frame: null }, stacks: ['', 'Error: owner'] },
    'Too dark',
    '27.0',
  )

  assert.deepEqual(body.element, { name: 'Card › Text' })
  // The first stack is the element's own; an owner's must not take its place.
  assert.deepEqual(body.stacks, ['', 'Error: owner'])
  assert.equal('stacks' in reportBody({ touch: { x: 1, y: 2 }, element: null, stacks: [''] }, 'x', '27.0'), false)
})

test('each status has its banner', () => {
  assert.equal(bannerFor('queued').text, 'Queued in Claude Code')
  assert.equal(bannerFor('fixing').text, 'Claude is fixing it')
  assert.equal(bannerFor('live').text, 'Fixed by Claude Code')
  assert.equal(bannerFor('stopped').text, 'Not applied: see Claude Code')
  assert.equal(bannerFor('live').working, false)
  assert.equal(bannerFor('fixing').working, true)
})
