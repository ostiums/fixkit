import 'package:fixkit/fixkit.dart';
import 'package:fixkit/src/host.dart' show runsOnDevice;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  testWidgets('on Android a long press opens the composer too', (tester) async {
    await tester.pumpWidget(app());
    await tester.longPress(find.text('Send'));
    await tester.pump();

    expect(find.byType(EditableText), findsOneWidget);
    expect(longPresses, 0);
  }, variant: TargetPlatformVariant.only(TargetPlatform.android));

  testWidgets("on the app's first screen Android still sends the back button to the open composer", (tester) async {
    // Android 16's predictive back leaves the app on its first screen without asking Flutter,
    // unless Flutter says it handles back.
    final calls = <MethodCall>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      calls.add(call);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await tester.pumpWidget(app());
    calls.clear();

    await tester.longPress(find.text('Send'));
    await tester.pump();

    expect(calls.where((call) => call.method == 'SystemNavigator.setFrameworkHandlesBack').map((call) => call.arguments), [true]);
  }, variant: TargetPlatformVariant.only(TargetPlatform.android));

  testWidgets('on a desktop the host is its child alone', (tester) async {
    await tester.pumpWidget(app());
    await tester.longPress(find.text('Send'));
    await tester.pump();

    expect(find.byType(EditableText), findsNothing);
    expect(longPresses, 1);
  }, variant: TargetPlatformVariant.only(TargetPlatform.macOS));

  testWidgets("Android's back button closes the composer, not the app's screen; then it pops the screen", (tester) async {
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      FixKitHost(
        child: MaterialApp(navigatorKey: navigator, home: const Scaffold(body: Text('Home'))),
      ),
    );
    navigator.currentState!.push(MaterialPageRoute<void>(builder: (_) => const Scaffold(body: Center(child: Text('Card')))));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('Card'));
    await tester.pump();
    expect(find.byType(EditableText), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(EditableText), findsNothing);
    expect(find.text('Card'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Card'), findsNothing);
    expect(find.text('Home'), findsOneWidget);
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

  testWidgets('the app slides up so the composer above the keyboard leaves the pressed element in sight', (tester) async {
    await tester.pumpWidget(
      const FixKitHost(child: MaterialApp(home: Scaffold(body: Align(alignment: Alignment.bottomCenter, child: Text('Pay'))))),
    );
    await tester.longPress(find.text('Pay'));
    tester.view.viewInsets = const FakeViewPadding(bottom: 900);
    addTearDown(tester.view.resetViewInsets);
    // The composer's light pulses for as long as it is open: the slide is over well within 500 ms.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // The composer's top: the screen less the keyboard, its gap and its height; the element 28 pt above.
    final composerTop = tester.view.physicalSize.height / tester.view.devicePixelRatio - 900 / tester.view.devicePixelRatio - 10 - 52;
    expect(tester.getRect(find.text('Pay')).bottom, moreOrLessEquals(composerTop - 28, epsilon: 0.5));
  }, variant: iOS);

  testWidgets("a Material button under the long press is not pressed; a tap presses it", (tester) async {
    var pressed = 0;
    await tester.pumpWidget(
      FixKitHost(child: MaterialApp(home: Scaffold(body: Center(child: TextButton(onPressed: () => pressed++, child: const Text('Pay')))))),
    );
    await tester.longPress(find.text('Pay'));
    await tester.pump();
    expect(find.byType(EditableText), findsOneWidget);
    expect(pressed, 0);

    await tester.tapAt(const Offset(4, 4));
    await tester.pump();
    await tester.tap(find.text('Pay'));
    await tester.pump(const Duration(seconds: 1));
    expect(pressed, 1);
  }, variant: iOS);

  test('the host runs on iOS, Android and under flutter test, not on a Mac that only looks like iOS', () {
    expect(runsOnDevice(isIOS: true, isAndroid: false, environment: const {}), isTrue);
    expect(runsOnDevice(isIOS: false, isAndroid: true, environment: const {}), isTrue);
    expect(runsOnDevice(isIOS: false, isAndroid: false, environment: const {'FLUTTER_TEST': 'true'}), isTrue);
    expect(runsOnDevice(isIOS: false, isAndroid: false, environment: const {}), isFalse);
  });
}
