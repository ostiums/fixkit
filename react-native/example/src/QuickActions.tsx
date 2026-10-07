import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const ACTIONS = ['Send', 'Top up', 'Request']

/** Each button counts its presses, so a press that should not have happened shows. */
export function QuickActions() {
  const [presses, setPresses] = useState<Record<string, number>>({})

  return (
    <View style={styles.row}>
      {ACTIONS.map(action => (
        <Pressable
          key={action}
          testID={`quickActions.${action}`}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => setPresses(all => ({ ...all, [action]: (all[action] ?? 0) + 1 }))}
        >
          <Text style={styles.title}>{action}</Text>
          <Text style={styles.count}>{presses[action] ?? 0}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 14, borderRadius: 16, backgroundColor: 'white' },
  pressed: { opacity: 0.6 },
  title: { fontSize: 16, fontWeight: '600', color: '#1F1B16' },
  count: { fontSize: 12, color: '#8A8178' },
})
