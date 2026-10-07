import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bundleFrom } from '../src/bundle.ts'

test('the bundle is the URL of the first frame of a stack', () => {
  const stack = [
    'Error',
    '    at bundleURL (http://127.0.0.1:8081/index.ts.bundle//&platform=ios&dev=true:93021:18)',
    '    at FixKitHost (http://127.0.0.1:8081/index.ts.bundle//&platform=ios&dev=true:93100:5)',
  ].join('\n')

  assert.equal(bundleFrom(stack), 'http://127.0.0.1:8081/index.ts.bundle//&platform=ios&dev=true')
  assert.equal(bundleFrom('Error\n    at run (native)'), null)
  assert.equal(bundleFrom(undefined), null)
})
