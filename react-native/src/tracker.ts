import type { Point } from './report'

type Timers = { set: (run: () => void, ms: number) => unknown; clear: (handle: unknown) => void }

const systemTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * Tells a long press from a touch: one finger held 450 ms within 10 pt of where it landed. 450 ms
 * is under the 500 ms after which a Pressable reports its own long press, so the press is FixKit's first.
 */
export class PressTracker {
  static readonly delay = 450
  static readonly slop = 10

  private readonly fire: (point: Point) => void
  private readonly timers: Timers
  private timer: unknown = null
  private origin: Point | null = null

  constructor(fire: (point: Point) => void, timers: Timers = systemTimers) {
    this.fire = fire
    this.timers = timers
  }

  /** A finger landed; `touches` is how many are down now. */
  start(point: Point, touches: number) {
    this.stop()
    if (touches !== 1) return
    this.origin = point
    this.timer = this.timers.set(() => {
      this.timer = null
      this.origin = null
      this.fire(point)
    }, PressTracker.delay)
  }

  move(point: Point) {
    if (this.origin && Math.hypot(point.x - this.origin.x, point.y - this.origin.y) > PressTracker.slop) {
      this.stop()
    }
  }

  stop() {
    if (this.timer !== null) this.timers.clear(this.timer)
    this.timer = null
    this.origin = null
  }
}
