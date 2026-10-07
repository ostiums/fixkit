import { StatusBar } from 'expo-status-bar'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { FixKitHost } from 'react-native-fixkit'

import { QuickActions } from './src/QuickActions'
import { Transactions } from './src/Transactions'
import { WalletCard } from './src/WalletCard'

export default function App() {
  return (
    <FixKitHost>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.greeting}>Good morning, Alex</Text>
          <WalletCard holder="Alex Morgan" number="•••• 4021" balance="€12,480.50" />
          <QuickActions />
          <Transactions />
        </ScrollView>
        <StatusBar style="dark" />
      </View>
    </FixKitHost>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F1EA' },
  content: { paddingTop: 76, paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  greeting: { fontSize: 28, fontWeight: '700', color: '#1F1B16' },
})
