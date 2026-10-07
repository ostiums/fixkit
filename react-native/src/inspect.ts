import { elementName } from './naming'
import type { Point, Target } from './report'

type Fiber = { _debugStack?: { stack?: string }; _debugOwner?: Fiber | null }
type ViewData = {
  hierarchy?: { name?: string }[]
  frame?: { left: number; top: number; width: number; height: number }
  closestInstance?: Fiber
}
type Renderer = {
  rendererConfig?: {
    getInspectorDataForViewAtPoint?: (view: unknown, x: number, y: number, callback: (data: ViewData) => void) => void
  }
}

export type Inspected = Pick<Target, 'element' | 'stacks'>

const NOTHING: Inspected = { element: null, stacks: [] }

/**
 * What React rendered at a point of the host view: the components that own it, its frame, and the
 * stacks React recorded where its JSX and its owners' JSX were written. Asks the inspector React
 * Native's own element inspector uses, through the DevTools hook RN installs in development.
 */
export function inspectAt(host: unknown, point: Point): Promise<Inspected> {
  const renderers: Map<number, Renderer> | undefined = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { renderers?: Map<number, Renderer> } })
    .__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers
  if (!host || !renderers) return Promise.resolve(NOTHING)

  return new Promise(resolve => {
    let answered = false
    const answer = (found: Inspected) => {
      if (answered) return
      answered = true
      resolve(found)
    }
    for (const renderer of renderers.values()) {
      renderer.rendererConfig?.getInspectorDataForViewAtPoint?.(host, point.x, point.y, data => {
        if (data?.hierarchy?.length) answer(describe(data))
      })
    }
    // No renderer answers for a point that holds nothing of React's.
    setTimeout(() => answer(NOTHING), 300)
  })
}

function describe({ hierarchy = [], frame, closestInstance }: ViewData): Inspected {
  const name = elementName(hierarchy.map(entry => entry.name ?? '')) ?? 'View'
  const element =
    frame && frame.width > 0 && frame.height > 0
      ? { name, frame: { x: frame.left, y: frame.top, width: frame.width, height: frame.height } }
      : null
  // The element's own stack, then its owners': where the component around it is used, and so on up.
  const stacks: string[] = []
  for (let fiber = closestInstance; fiber && stacks.length < 3; fiber = fiber._debugOwner ?? undefined) {
    const stack = fiber._debugStack?.stack
    if (stack) stacks.push(stack)
  }
  return { element, stacks }
}
