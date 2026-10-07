import { StyleSheet, Text, View } from 'react-native'

const TRANSACTIONS = [
  { merchant: 'Northwind GmbH', detail: 'Salary, September', amount: '+€4,650.00' },
  { merchant: 'BVG', detail: 'Transport', amount: '−€3.20' },
  { merchant: 'Rewe', detail: 'Groceries', amount: '−€46.18' },
]

export function Transactions() {
  return (
    <View style={styles.list}>
      <Text style={styles.heading}>Activity</Text>
      {TRANSACTIONS.map(transaction => (
        <View key={transaction.merchant} style={styles.row}>
          <View>
            <Text style={styles.merchant}>{transaction.merchant}</Text>
            <Text style={styles.detail}>{transaction.detail}</Text>
          </View>
          <Text style={styles.amount}>{transaction.amount}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 4 },
  heading: { fontSize: 20, fontWeight: '700', color: '#1F1B16', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D9D0C4',
  },
  merchant: { fontSize: 16, fontWeight: '600', color: '#1F1B16' },
  detail: { fontSize: 13, color: '#8A8178' },
  amount: { fontSize: 16, fontWeight: '600', color: '#1F1B16' },
})
