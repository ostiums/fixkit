// node --test mod/tests/*.node.test.mjs: the accessibility lookup against a tree captured from Tally's Activity screen.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { elementAt } from '../server/inspect.mjs'

const tree = JSON.parse(readFileSync(new URL('./fixtures/activity-screen.json', import.meta.url), 'utf8'))

test('a text in a row comes with the labels beside it', () => {
  const found = elementAt(tree, { x: 321, y: 686 })

  assert.equal(found.element.type, 'StaticText')
  assert.equal(found.element.label, '+€4,650.00')
  assert.ok(found.nearby.includes('Northwind GmbH'))
  assert.ok(found.nearby.includes('Salary, September'))
  // The rows above and below are not beside it.
  assert.ok(!found.nearby.includes('BVG'))
})

test('a chart bar carries its value', () => {
  const found = elementAt(tree, { x: 131, y: 393 })

  assert.deepEqual([found.element.label, found.element.value], ['Shop', '493'])
})

test('an icon names the control around it', () => {
  const found = elementAt(tree, { x: 201, y: 808 })

  assert.equal(found.element.type, 'Image')
  assert.deepEqual([found.within.type, found.within.label], ['RadioButton', 'Activity'])
})

test('a touch on nothing named finds nothing', () => {
  assert.equal(elementAt(tree, { x: 200, y: 40 }), null)
})

test("FixKit's own banner is never what was pressed", () => {
  const frame = (x, y, width, height) => ({ x, y, width, height })
  // Without the rule the banner's text, one level deeper, would win.
  const screen = [
    {
      type: 'Application',
      AXLabel: 'App',
      frame: frame(0, 0, 400, 800),
      children: [
        {
          type: 'Group',
          frame: frame(0, 0, 400, 100),
          children: [
            { type: 'StaticText', AXLabel: 'Total', frame: frame(0, 0, 100, 20) },
            {
              type: 'Group',
              AXUniqueId: 'fixkit.banner',
              frame: frame(0, 0, 400, 40),
              children: [{ type: 'StaticText', AXLabel: 'Sent to Claude Code', frame: frame(10, 5, 200, 20) }],
            },
          ],
        },
      ],
    },
  ]
  const found = elementAt(screen, { x: 50, y: 10 })

  assert.equal(found.element.label, 'Total')
  assert.deepEqual(found.nearby, [])
})
