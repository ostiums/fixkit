import 'package:fixkit_example/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('the wallet shows its balance and actions', (tester) async {
    await tester.pumpWidget(const WalletApp());
    expect(find.text('€12,480.50'), findsOneWidget);
    expect(find.text('Top up'), findsOneWidget);
  });
}
