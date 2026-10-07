import assert from 'node:assert/strict'
import { test } from 'node:test'

import { elementName } from '../src/naming.ts'

test('the last two components, host views and wrappers left out', () => {
  assert.equal(elementName(['withDevTools(App)', 'App', 'WalletCard', 'Text', 'RCTText']), 'WalletCard › Text')
  assert.equal(elementName(['withDevTools(App)', 'App', 'Text', 'RCTText']), 'App › Text')
  assert.equal(elementName(['App']), 'App')
  assert.equal(elementName(['RCTView', '']), null)
})
