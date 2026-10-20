// node --test mod/tests/*.node.test.mjs: the receiver's adb side, which Android device a report came from.
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { Adb, adbCandidates, macVmService, parseDevices, parseForwards, pickDevice } from '../server/android.mjs'
import { adbCalls, deviceList, fakeAdb } from './fake-adb.mjs'

const folder = () => mkdtempSync(join(tmpdir(), 'fixkit-adb-'))

/** An executable `adb` in `dir`, which it creates. */
function executable(dir) {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'adb')
  writeFileSync(path, '#!/bin/sh\n')
  chmodSync(path, 0o755)
  return path
}

test('FIXKIT_ADB is the only adb when set, even a missing one', () => {
  const root = folder()
  const own = executable(join(root, 'own'))
  const sdk = join(root, 'sdk')
  executable(join(sdk, 'platform-tools'))

  assert.deepEqual(adbCandidates({ FIXKIT_ADB: own, ANDROID_HOME: sdk }, root), [own])
  assert.deepEqual(adbCandidates({ FIXKIT_ADB: join(root, 'none'), ANDROID_HOME: sdk }, root), [])
})

test('without FIXKIT_ADB, the SDK named in the environment, then PATH, then the default SDK', () => {
  const root = folder()
  const home = executable(join(root, 'home-sdk', 'platform-tools'))
  const sdkRoot = executable(join(root, 'root-sdk', 'platform-tools'))
  const onPath = executable(join(root, 'bin'))
  const fallback = executable(join(root, 'Library', 'Android', 'sdk', 'platform-tools'))
  const env = { ANDROID_HOME: join(root, 'home-sdk'), ANDROID_SDK_ROOT: join(root, 'root-sdk'), PATH: join(root, 'bin') }

  assert.deepEqual(adbCandidates(env, root), [home, sdkRoot, onPath, fallback])
})

test('only devices online count', () => {
  const listed = 'List of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\nR58M\tunauthorized\n\n'

  assert.deepEqual(parseDevices(listed), ['emulator-5554'])
})

test('forwards of tcp ports, by device', () => {
  const listed = 'emulator-5554 tcp:52361 tcp:43123\nemulator-5554 tcp:8000 localabstract:x\n'

  assert.deepEqual(parseForwards(listed), [{ serial: 'emulator-5554', host: 52361, device: 43123 }])
})

test("a Flutter app's VM service on the device is reached through the Mac's port forwarded to it", () => {
  const forwards = [{ serial: 'emulator-5554', host: 52361, device: 43123 }]

  assert.equal(macVmService('http://127.0.0.1:43123/abc=/', forwards), 'http://127.0.0.1:52361/abc=/')
})

test("DDS's address, which the app gives once flutter run attached it, is on the Mac already", () => {
  const forwards = [{ serial: 'emulator-5554', host: 52361, device: 43123 }]

  assert.equal(macVmService('http://127.0.0.1:56221/dds=/', forwards), 'http://127.0.0.1:56221/dds=/')
})

test('the only device online, without asking its API level', async () => {
  const sdkOf = () => assert.fail('asked for the API level')

  assert.deepEqual(await pickDevice(['a'], { os: '36', sdkOf }), { serial: 'a', online: 1 })
})

test('of several, the one on the app’s API level', async () => {
  const sdk = { a: '36', b: '35' }

  assert.deepEqual(await pickDevice(['a', 'b'], { os: '36', sdkOf: async serial => sdk[serial] }), { serial: 'a', online: 2 })
})

test('two on one API level, none online, or several and no level leave it unknown', async () => {
  const sdkOf = async () => '36'

  assert.deepEqual(await pickDevice(['a', 'b'], { os: '36', sdkOf }), { serial: null, online: 2 })
  assert.deepEqual(await pickDevice([], { os: '36', sdkOf }), { serial: null, online: 0 })
  assert.deepEqual(await pickDevice(['a', 'b'], { sdkOf }), { serial: null, online: 2 })
})

test('adb lists devices, keeps the port reversed and takes a screenshot byte for byte', async () => {
  const dir = folder()
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])
  const adb = new Adb(fakeAdb(dir, { devices: deviceList('emulator-5554'), png }))
  const shot = join(dir, 'shot.png')

  assert.deepEqual(await adb.devices(), ['emulator-5554'])
  await adb.reverse('emulator-5554', 4747)
  await adb.screencap('emulator-5554', shot)

  assert.deepEqual(readFileSync(shot), png)
  assert.ok(adbCalls(dir).some(args => args.join(' ') === '-s emulator-5554 reverse tcp:4747 tcp:4747'))
})
