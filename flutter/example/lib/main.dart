import 'package:fixkit/fixkit.dart';
import 'package:flutter/material.dart';

import 'quick_actions.dart';
import 'transactions.dart';
import 'wallet_card.dart';

void main() => runApp(const FixKitHost(child: WalletApp()));

class WalletApp extends StatelessWidget {
  const WalletApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(scaffoldBackgroundColor: const Color(0xFFF6F1EA), fontFamily: '.SF Pro Text'),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 76, 20, 40),
        children: const [
          Text('Good morning, Alex', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: Color(0xFF1F1B16))),
          SizedBox(height: 20),
          WalletCard(holder: 'Alex Morgan', number: '•••• 4021', balance: '€12,480.50'),
          SizedBox(height: 20),
          QuickActions(),
          SizedBox(height: 20),
          Transactions(),
        ],
      ),
    );
  }
}
