import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Keyboard, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'

import type { Banner } from './banners'
import { dimAround, liftFor, spotlight } from './layout'
import type { Target } from './report'
import { cancel, send, setDraft, setLift, type SessionState } from './session'

// FixKit's tint, the Swift package's own.
const TINT = '#D97857'
// Below the status bar of an iPhone with a Dynamic Island; React Native has no safe-area insets of its own.
const BANNER_TOP = 60

/** FixKit's views above the app: the outline for a screenshot, the composer, the banner. */
export function Overlay({ state }: { state: SessionState }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {state.outline && <Outline target={state.outline} />}
      {state.target && <Composer target={state.target} draft={state.draft} lift={state.lift} />}
      {state.banner && <BannerView banner={state.banner} />}
    </View>
  )
}

/** The pressed element outlined in red, or a red ring where the finger was. */
function Outline({ target }: { target: Target }) {
  const frame = target.element?.frame
  const shape = frame
    ? { left: frame.x - 4, top: frame.y - 4, width: frame.width + 8, height: frame.height + 8, borderRadius: 8 }
    : { left: target.touch.x - 22, top: target.touch.y - 22, width: 44, height: 44, borderRadius: 22 }
  return <View pointerEvents="none" testID="fixkit.outline" style={[styles.outline, shape]} />
}

/** The dimmed screen with the pressed element lit, and the comment field above the keyboard. */
function Composer({ target, draft, lift }: { target: Target; draft: string; lift: number }) {
  const { width, height } = useWindowDimensions()
  const [keyboard, setKeyboard] = useState(0)
  const [labelWidth, setLabelWidth] = useState(0)
  const pulse = useRef(new Animated.Value(0.35)).current

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardWillShow', event => setKeyboard(height - event.endCoordinates.screenY))
    const hidden = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0))
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => {
      shown.remove()
      hidden.remove()
      loop.stop()
    }
  }, [height, pulse])

  const frame = target.element?.frame ?? null
  const elementBottom = frame ? frame.y + frame.height : target.touch.y
  const lit = spotlight(frame, target.touch, lift)
  const canSend = draft.trim().length > 0

  return (
    // A tap anywhere but the composer cancels, the lit element included: the app under it must not act.
    <Pressable style={StyleSheet.absoluteFill} onPress={cancel} testID="fixkit.composer" accessible={false}>
      {dimAround(lit, width, height).map((rect, index) => (
        <View key={index} pointerEvents="none" style={[styles.dim, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]} />
      ))}
      <Animated.View
        pointerEvents="none"
        style={[styles.spot, { left: lit.x, top: lit.y, width: lit.width, height: lit.height, borderRadius: frame ? 12 : 28, opacity: pulse }]}
      />
      {target.element && (
        <Text
          onLayout={event => setLabelWidth(event.nativeEvent.layout.width)}
          style={[
            styles.label,
            {
              left: Math.min(Math.max(lit.x + lit.width / 2 - labelWidth / 2, 12), width - labelWidth - 12),
              top: lit.y > 120 ? lit.y - 34 : lit.y + lit.height + 10,
            },
          ]}
        >
          {target.element.name}
        </Text>
      )}
      <View
        style={[styles.composer, { bottom: keyboard + 10 }]}
        onLayout={event => setLift(liftFor(elementBottom, event.nativeEvent.layout.y))}
      >
        <Text style={styles.sparkle}>✦</Text>
        <TextInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void send()}
          placeholder="What should Claude fix here?"
          placeholderTextColor="rgba(255,255,255,0.55)"
          returnKeyType="send"
          autoCorrect={false}
          keyboardAppearance="dark"
          selectionColor={TINT}
          style={styles.input}
        />
        <Pressable onPress={() => void send()} disabled={!canSend} style={[styles.send, { backgroundColor: canSend ? TINT : 'rgba(255,255,255,0.14)' }]}>
          <Text style={styles.sendGlyph}>↵</Text>
        </Pressable>
      </View>
    </Pressable>
  )
}

function BannerView({ banner }: { banner: Banner }) {
  return (
    <View pointerEvents="none" style={styles.bannerRow}>
      <View testID="fixkit.banner" accessible accessibilityLabel={banner.text} style={styles.banner}>
        {banner.working ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.bannerGlyph}>{banner.glyph}</Text>}
        <Text style={styles.bannerText}>{banner.text}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outline: { position: 'absolute', borderWidth: 2, borderColor: '#FF3B30' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.62)' },
  spot: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: TINT,
    shadowColor: TINT,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: TINT,
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Menlo',
  },
  composer: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 7,
    paddingVertical: 7,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(217,120,87,0.55)',
    backgroundColor: 'rgba(40,40,44,0.92)',
    shadowColor: 'black',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  sparkle: { color: TINT, fontSize: 16, fontWeight: '600' },
  input: { flex: 1, color: 'white', fontSize: 16, paddingVertical: 8 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sendGlyph: { color: 'white', fontSize: 17, fontWeight: '700' },
  bannerRow: { position: 'absolute', top: BANNER_TOP, left: 0, right: 0, alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: TINT,
    shadowColor: 'black',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  bannerGlyph: { color: 'white', fontSize: 13, fontWeight: '700' },
  bannerText: { color: 'white', fontSize: 14, fontWeight: '600' },
})
