export type Point = { x: number; y: number }
export type Frame = { x: number; y: number; width: number; height: number }

/** What the long press captured, before the comment is typed. */
export type Target = {
  touch: Point
  element: { name: string; frame: Frame } | null
  /** Where the element's JSX and its owners' JSX were written, as React recorded them. */
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
export function reportBody(target: Target, comment: string, os: string) {
  return {
    platform: 'react-native' as const,
    os,
    comment,
    screen: '',
    touch: { x: Math.round(target.touch.x), y: Math.round(target.touch.y) },
    ...(target.element && { element: { name: target.element.name, frame: rounded(target.element.frame) } }),
    ...(target.stacks.length > 0 && { stacks: target.stacks }),
  }
}
