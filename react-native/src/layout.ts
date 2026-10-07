import type { Frame, Point } from './report'

/** How far the app slides up so the pressed element stays 28 pt above the composer. */
export function liftFor(elementBottom: number, composerTop: number) {
  return Math.max(0, elementBottom + 28 - composerTop)
}

/** The frame with `margin` around it, or without one a square of `radius` around the touch. */
export function around(frame: Frame | null, touch: Point, margin: number, radius: number): Frame {
  const [base, by] = frame ? [frame, margin] : [{ x: touch.x, y: touch.y, width: 0, height: 0 }, radius]
  return { x: base.x - by, y: base.y - by, width: base.width + by * 2, height: base.height + by * 2 }
}

/** The lit area: the element's frame and 6 pt around it, or a square around the touch, moved with the app. */
export function spotlight(frame: Frame | null, touch: Point, lift: number): Frame {
  const lit = around(frame, touch, 6, 28)
  return { ...lit, y: lit.y - lift }
}

/** The four dimmed rectangles around the lit frame: above, below, left and right of it. */
export function dimAround(lit: Frame, width: number, height: number): Frame[] {
  const top = Math.min(height, Math.max(0, lit.y))
  const bottom = Math.max(top, Math.min(height, lit.y + lit.height))
  const left = Math.min(width, Math.max(0, lit.x))
  const right = Math.max(left, Math.min(width, lit.x + lit.width))
  return [
    { x: 0, y: 0, width, height: top },
    { x: 0, y: bottom, width, height: height - bottom },
    { x: 0, y: top, width: left, height: bottom - top },
    { x: right, y: top, width: width - right, height: bottom - top },
  ]
}
