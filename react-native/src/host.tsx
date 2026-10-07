import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { Animated, StyleSheet, View, type GestureResponderEvent } from 'react-native'

import { hold, installHold, release } from './hold'
import { inspectAt } from './inspect'
import { Overlay } from './overlay'
import { announceLaunch, begin, isBusy, store } from './session'
import { PressTracker } from './tracker'

let installed = false

/** Once per JavaScript runtime: the hold on Pressability and the Fast Refresh signal. */
function install() {
  if (installed) return
  installed = true

  try {
    // Private, so required inside `try`: if it moves, FixKit loses the hold, not the bundle.
    const pressability = require('react-native/Libraries/Pressability/Pressability')
    installHold((pressability.default ?? pressability).prototype)
  } catch {}

  // React Native's Fast Refresh runtime; a refresh that applies a fix puts it on screen without a launch.
  const refresh = (globalThis as { __ReactRefresh?: { performReactRefresh?: (...args: unknown[]) => unknown; __fixkit?: true } }).__ReactRefresh
  if (refresh?.performReactRefresh && !refresh.__fixkit) {
    const perform = refresh.performReactRefresh
    refresh.performReactRefresh = (...args: unknown[]) => {
      const result = perform(...args)
      void announceLaunch()
      return result
    }
    refresh.__fixkit = true
  }
}

const point = (event: GestureResponderEvent) => ({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })

export function FixKitHost({ children }: { children: ReactNode }) {
  const root = useRef<View>(null)
  const lift = useRef(new Animated.Value(0)).current
  const state = useSyncExternalStore(store.subscribe, store.get)
  const tracker = useRef<PressTracker | null>(null)
  tracker.current ??= new PressTracker(at => {
    if (isBusy()) return
    hold()
    void inspectAt(root.current, at).then(found => begin({ touch: at, ...found }))
  })

  useEffect(() => {
    install()
    // A stack from this code names the bundle it runs from.
    void announceLaunch(new Error().stack ?? null)
  }, [])

  useEffect(() => {
    Animated.spring(lift, { toValue: -state.lift, useNativeDriver: true, bounciness: 0, speed: 20 }).start()
  }, [lift, state.lift])

  const ended = (event: GestureResponderEvent) => {
    tracker.current?.stop()
    // The hold lasts until the last finger lifts: a second one lifting first must not free the press.
    if (event.nativeEvent.touches.length === 0) release()
  }

  return (
    <View
      ref={root}
      style={styles.fill}
      onTouchStart={event => tracker.current?.start(point(event), event.nativeEvent.touches.length)}
      onTouchMove={event => tracker.current?.move(point(event))}
      onTouchEnd={ended}
      onTouchCancel={() => {
        tracker.current?.stop()
        release()
      }}
    >
      <Animated.View style={[styles.fill, { transform: [{ translateY: lift }] }]}>{children}</Animated.View>
      <Overlay state={state} />
    </View>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
