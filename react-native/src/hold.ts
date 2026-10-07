// Holds a press for FixKit. A Pressable presses on release whatever is drawn over it, so while
// FixKit holds a press the Pressable under the finger neither reports its own long press nor
// presses when the finger lifts. Works by wrapping Pressability, the private class behind
// Pressable, the Touchable components, Button and pressable Text; development builds only.

type Signal = (this: unknown, signal: string, event: unknown) => void
type PressabilityPrototype = { _receiveSignal?: Signal; __fixkitHold?: true }

let held = false

/** Wraps the class's signal handler once; false when the class is not what it used to be. */
export function installHold(prototype: PressabilityPrototype | undefined) {
  if (!prototype || typeof prototype._receiveSignal !== 'function') return false
  if (prototype.__fixkitHold) return true
  const receive = prototype._receiveSignal
  prototype._receiveSignal = function (signal, event) {
    if (held && signal === 'LONG_PRESS_DETECTED') return
    receive.call(this, held && signal === 'RESPONDER_RELEASE' ? 'RESPONDER_TERMINATED' : signal, event)
  }
  prototype.__fixkitHold = true
  return true
}

export function hold() {
  held = true
}

/** Lets go after the touch has ended: the release that ends it still reaches the Pressable held. */
export function release() {
  setTimeout(() => {
    held = false
  }, 0)
}

export const isHeld = () => held
