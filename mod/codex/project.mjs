// Whether a Codex session works on an app FixKit can report from. Outside one the hooks
// start nothing and add nothing to the session, so other projects pay no tokens for it.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { projectKind } from '../core/prompt.mjs'

const APPLE = /\.(xcodeproj|xcworkspace)$|^Package\.swift$/

/**
 * The app project around `cwd`: the nearest folder, up to the git root, holding an Xcode
 * project or workspace, a Package.swift, a package.json that depends on React Native, or a
 * pubspec.yaml that depends on Flutter.
 * @param {string} cwd
 * @returns {{ packageJson: string | null, pubspec: string | null } | null}
 */
export function appProject(cwd) {
  for (let dir = cwd; ; dir = dirname(dir)) {
    let names = []
    try {
      names = readdirSync(dir)
    } catch {}
    const packageJson = names.includes('package.json') ? read(join(dir, 'package.json')) : null
    const pubspec = names.includes('pubspec.yaml') ? read(join(dir, 'pubspec.yaml')) : null
    if (projectKind({ packageJson, pubspec }) !== 'native') return { packageJson, pubspec }
    if (names.some(name => APPLE.test(name))) return { packageJson, pubspec }
    if (names.includes('.git') || dirname(dir) === dir) return null
  }
}

/** @param {string} path */
function read(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
