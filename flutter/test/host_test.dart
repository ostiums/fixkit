import 'package:fixkit/fixkit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late int taps;
  late int longPresses;

  Widget app() => FixKitHost(
    child: Directionality(
      textDirection: TextDirection.ltr,
      child: Center(
        child: GestureDetector(
          onTap: () => taps++,
          onLongPress: () => longPresses++,
          child: const SizedBox(width: 120, height: 48, child: Text('Send')),
        ),
      ),
    ),
  );

  setUp(() {
    taps = 0;
    longPresses = 0;
  });
  final iOS = TargetPlatformVariant.only(TargetPlatform.iOS);

  testWidgets('a long press opens the composer and presses nothing; a tap still presses', (tester) async {
    await tester.pumpWidget(app());

    await tester.longPress(find.text('Send'));
    await tester.pump();

    expect(find.byType(EditableText), findsOneWidget);
    expect(taps, 0);
    expect(longPresses, 0);

    await tester.tapAt(const Offset(5, 5));
    await tester.pump();
    expect(find.byType(EditableText), findsNothing);

    await tester.tap(find.text('Send'));
    expect(taps, 1);
  }, variant: iOS);

  testWidgets("the composer's panel takes its own taps; the app under the dimmed screen gets none", (tester) async {
    await tester.pumpWidget(app());
    await tester.longPress(find.text('Send'));
    await tester.pump();

    await tester.tap(find.byType(EditableText), warnIfMissed: false);
    await tester.pump();
    expect(find.byType(EditableText), findsOneWidget);

    await tester.tap(find.text('Send').first, warnIfMissed: false);
    await tester.pump();
    expect(taps, 0);
    expect(find.byType(EditableText), findsNothing);
  }, variant: iOS);

  testWidgets('off iOS the host is its child alone', (tester) async {
    await tester.pumpWidget(app());
    await tester.longPress(find.text('Send'));
    await tester.pump();

    expect(find.byType(EditableText), findsNothing);
    expect(longPresses, 1);
  }, variant: TargetPlatformVariant.only(TargetPlatform.android));

  testWidgets('the keyboard the composer opens does not resize the app under it', (tester) async {
    await tester.pumpWidget(const FixKitHost(child: MaterialApp(home: Scaffold(body: Center(child: Text('Pay'))))));
    await tester.longPress(find.text('Pay'));
    await tester.pump();

    tester.view.viewInsets = const FakeViewPadding(bottom: 900);
    addTearDown(tester.view.resetViewInsets);
    await tester.pump();

    // What the Scaffold sees: it would shrink its body by it.
    expect(MediaQuery.viewInsetsOf(tester.element(find.byType(Scaffold))).bottom, 0);
    expect(find.byType(EditableText), findsOneWidget);

    // Sent, the composer is gone while its keyboard still slides away.
    await tester.enterText(find.byType(EditableText), 'Make it green');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect(find.byType(EditableText), findsNothing);
    expect(MediaQuery.viewInsetsOf(tester.element(find.byType(Scaffold))).bottom, 0);

    // The report leaves once the keyboard is gone; no receiver answers it, and the banner says so.
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pump(const Duration(seconds: 5));
  }, variant: iOS);
}
