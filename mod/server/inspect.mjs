// Tells which element a report's touch landed on, from the simulator's accessibility tree as
// AXe describes it. The app needs no marks for this: SwiftUI exposes every text, image and
// control to accessibility. No dependencies beside AXe itself.
import { execFile } from 'node:child_process'
import { accessSync, constants, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Where AXe may be, most specific first: the variable, `PATH`, then XcodeBuildMCP's bundled copy. */
export function axeCandidates(env = process.env) {
  const found = []
  const add = path => {
    try {
      accessSync(path, constants.X_OK)
      if (!found.includes(path)) found.push(path)
    } catch {}
  }

  if (env.FIXKIT_AXE) add(env.FIXKIT_AXE)
  for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) add(join(dir, 'axe'))

  // npx keeps each package it ran in a folder of its own; the newest copy is likeliest to work.
  const cache = join(homedir(), '.npm', '_npx')
  let folders = []
  try {
    folders = readdirSync(cache)
  } catch {}
  folders
    .flatMap(folder => {
      const path = join(cache, folder, 'node_modules', 'xcodebuildmcp', 'bundled', 'axe')
      try {
        return [{ path, modified: statSync(path).mtimeMs }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.modified - a.modified)
    .forEach(({ path }) => add(path))

  return found
}

/** The simulator's accessibility tree: AXe's `describe-ui`, a list of root elements. */
export async function describeScreen(axe, udid) {
  const { stdout } = await run(axe, ['describe-ui', '--udid', udid], { timeout: 10_000, maxBuffer: 32 * 1024 * 1024 })
  const tree = JSON.parse(stdout)
  if (!Array.isArray(tree)) throw new Error('describe-ui did not answer a list')
  return tree
}

const contains = (frame, { x, y }) =>
  frame != null && x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height

const isNamed = node => Boolean(node.AXLabel || node.AXValue || node.AXUniqueId)
// The app's own element spans the screen and names nothing but the app.
const isPressable = node => node.type !== 'Application' && isNamed(node)
// FixKit's own views (a banner, the composer) are never what was pressed.
const isFixKit = node => node.AXUniqueId?.startsWith('fixkit.') === true

const summary = node => ({
  type: node.type ?? node.role ?? 'Element',
  label: node.AXLabel ?? null,
  value: node.AXValue ?? null,
  identifier: node.AXUniqueId ?? null,
})

/** Every named element under `node`, itself left out. */
function namedBelow(node) {
  return (node.children ?? [])
    .filter(child => !isFixKit(child))
    .flatMap(child => [...(isNamed(child) ? [child] : []), ...namedBelow(child)])
}

/**
 * The element a touch landed on, the named element it sits in, and the labels beside it.
 *
 * The element is the deepest named element whose frame holds the point (the smaller one when two
 * are as deep); the app itself is never it. `within` is its nearest named ancestor: the tab
 * button around an icon, say. Beside it are the other named elements under the same parent that
 * share its row, nearest first, up to six.
 */
export function elementAt(tree, point) {
  let best = null
  const visit = (node, ancestors) => {
    if (isFixKit(node) || !contains(node.frame, point)) return
    if (isPressable(node)) {
      const area = node.frame.width * node.frame.height
      const depth = ancestors.length
      if (best === null || depth > best.depth || (depth === best.depth && area < best.area)) {
        best = { node, depth, area, ancestors }
      }
    }
    for (const child of node.children ?? []) visit(child, [...ancestors, node])
  }
  for (const root of tree) visit(root, [])
  if (best === null) return null

  const parent = best.ancestors.at(-1) ?? { children: [] }
  const within = best.ancestors.findLast(isPressable)

  const { frame } = best.node
  const top = frame.y - 12
  const bottom = frame.y + frame.height + 12
  const centre = node => ({ x: node.frame.x + node.frame.width / 2, y: node.frame.y + node.frame.height / 2 })
  const distance = node => Math.hypot(centre(node).x - point.x, centre(node).y - point.y)
  const labels = new Set(
    namedBelow(parent)
      .filter(node => node.AXLabel && node.frame && node.frame.y < bottom && node.frame.y + node.frame.height > top)
      .sort((a, b) => distance(a) - distance(b))
      .map(node => node.AXLabel),
  )
  labels.delete(best.node.AXLabel)
  const nearby = [...labels].slice(0, 6)

  return { element: summary(best.node), within: within ? summary(within) : null, nearby }
}
