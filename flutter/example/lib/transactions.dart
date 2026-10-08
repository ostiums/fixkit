import 'package:flutter/material.dart';

const _transactions = [
  (merchant: 'Northwind GmbH', detail: 'Salary, September', amount: '+€4,650.00'),
  (merchant: 'BVG', detail: 'Transport', amount: '−€3.20'),
  (merchant: 'Rewe', detail: 'Groceries', amount: '−€46.18'),
];

class Transactions extends StatelessWidget {
  const Transactions({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 8),
          child: Text('Activity', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFF1F1B16))),
        ),
        for (final transaction in _transactions)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFD9D0C4), width: 0.5))),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(transaction.merchant, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF1F1B16))),
                    Text(transaction.detail, style: const TextStyle(fontSize: 13, color: Color(0xFF8A8178))),
                  ],
                ),
                Text(transaction.amount, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF1F1B16))),
              ],
            ),
          ),
      ],
    );
  }
}
