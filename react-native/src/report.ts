export type Point = { x: number; y: number }
export type Frame = { x: number; y: number; width: number; height: number }

/** What the long press captured, before the comment is typed. */
export type Target = {
  touch: Point
  /** What React rendered there: its components, and its frame when it has a size. */
  element: { name: string; frame: Frame | null } | null
  /**
   * Where the element's JSX and its owners' JSX were written, as React recorded them. The first is
   * the element's own, empty when React kept none, so an owner's never passes for it.
   */
  stacks: string[]
}

const rounded = ({ x, y, width, height }: Frame): Frame => ({
  x: Math.round(x),
  y: Math.round(y),
  width: Math.round(width),
  height: Math.round(height),
})

/**
 * The report as the receiver takes it. The receiver finds the simulator from `os`, takes the
 * screenshot, and turns `stacks` into source lines through Metro.
 */
export function reportBody({ touch, element, stacks }: Target, comment: string, os: string) {
  return {
    os,
    comment,
    screen: '',
    touch: { x: Math.round(touch.x), y: Math.round(touch.y) },
    ...(element && { element: { name: element.name, ...(element.frame && { frame: rounded(element.frame) }) } }),
    ...(stacks.some(Boolean) && { stacks }),
  }
}
