import { StyleSheet, Text, View } from 'react-native'

type Props = { holder: string; number: string; balance: string }

export function WalletCard({ holder, number, balance }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.caption}>Balance</Text>
      <Text style={styles.balance}>{balance}</Text>
      <View style={styles.footer}>
        <Text style={styles.holder}>{holder}</Text>
        <Text style={styles.number}>{number}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1F1B16', borderRadius: 24, padding: 22, gap: 6 },
  caption: { color: '#B8AFA3', fontSize: 14 },
  balance: { color: 'white', fontSize: 34, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  holder: { color: 'white', fontSize: 16, fontWeight: '600' },
  number: { color: '#B8AFA3', fontSize: 16 },
})
