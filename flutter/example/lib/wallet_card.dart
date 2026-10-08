import 'package:flutter/material.dart';

class WalletCard extends StatelessWidget {
  const WalletCard({super.key, required this.holder, required this.number, required this.balance});

  final String holder;
  final String number;
  final String balance;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(color: const Color(0xFF1F1B16), borderRadius: BorderRadius.circular(24)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Balance', style: TextStyle(color: Color(0xFFB8AFA3), fontSize: 14)),
          const SizedBox(height: 6),
          Text(balance, style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w700)),
          const SizedBox(height: 28),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(holder, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
              Text(number, style: const TextStyle(color: Color(0xFFB8AFA3), fontSize: 16)),
            ],
          ),
        ],
      ),
    );
  }
}
