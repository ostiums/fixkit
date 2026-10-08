import 'dart:io';

import 'package:fixkit/src/inspect.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The line of this file that holds `text`, to compare with where a widget is constructed.
int lineOf(String text) => File('test/inspect_test.dart').readAsLinesSync().indexWhere((line) => line.contains(text)) + 1;

class NameCard extends StatelessWidget {
  const NameCard({super.key});

  @override
  Widget build(BuildContext context) => const Padding(padding: EdgeInsets.all(8), child: Text('Alex Morgan')); // the name
}

class Screen extends StatelessWidget {
  const Screen({super.key});

  @override
  Widget build(BuildContext context) => const Center(child: NameCard()); // the card
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('Hello'))); // the greeting
}

class DetailPage extends StatelessWidget {
  const DetailPage({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Align(alignment: Alignment.centerLeft, child: Padding(padding: EdgeInsets.only(left: 16), child: Text('Edge'))), // the edge
  );
}

/// A widget the app did not write: its child is constructed here, in a "package" stand-in, which
/// the inspector cannot tell from the app; the test stands in for one with a framework widget.
Widget app(Widget child) => Directionality(textDirection: TextDirection.ltr, child: child);

void main() {
  testWidgets("names the app's widget around the pressed text, with the lines it is written and used at", (tester) async {
    await tester.pumpWidget(app(const Screen()));
    final host = tester.element(find.byType(Directionality));

    final found = inspectAt(tester.getCenter(find.text('Alex Morgan')), host).element!;

    expect(found.name, 'NameCard › Text');
    expect(found.source!.file, endsWith('test/inspect_test.dart'));
    expect(found.source!.line, lineOf('// the name'));
    expect(found.usedAt.map((use) => use.line), [lineOf('// the card'), lineOf('app(const Screen())')]);
    expect(found.frame, tester.getRect(find.text('Alex Morgan')));
  });

  testWidgets('nothing above the host is looked at: with only Flutter below it, the touch alone', (tester) async {
    // The Container is the test's; the ConstrainedBox and the ColoredBox it builds are Flutter's,
    // and the host is that ConstrainedBox.
    await tester.pumpWidget(app(Center(child: Container(width: 100, height: 100, color: const Color(0xFF336699)))));
    final host = tester.element(find.descendant(of: find.byType(Container), matching: find.byType(ConstrainedBox)));
    final touch = tester.getCenter(find.byType(Container));

    final target = inspectAt(touch, host);

    expect(target.touch, touch);
    expect(target.element, isNull);
  });

  testWidgets("a widget the app did not construct is skipped for the app's one around it", (tester) async {
    // EditableText's insides are constructed by Flutter; the press lands on them.
    final controller = TextEditingController(text: 'note');
    final focus = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focus.dispose);
    await tester.pumpWidget(
      app(
        Center(
          child: SizedBox(
            width: 200,
            child: EditableText( // the field
              controller: controller,
              focusNode: focus,
              style: const TextStyle(fontSize: 16),
              cursorColor: const Color(0xFF000000),
              backgroundCursorColor: const Color(0xFF888888),
            ),
          ),
        ),
      ),
    );
    final host = tester.element(find.byType(Directionality));

    final found = inspectAt(tester.getCenter(find.byType(EditableText)), host).element!;

    expect(found.source!.line, lineOf('// the field'));
    expect(found.name, 'EditableText');
  });

  testWidgets("a Scaffold's own wrappers are not the app's widget: the screen is", (tester) async {
    await tester.pumpWidget(const MaterialApp(home: HomePage())); // the app
    final host = tester.element(find.byType(MaterialApp));

    final found = inspectAt(tester.getCenter(find.text('Hello')), host).element!;

    expect(found.name, 'HomePage › Text');
    expect(found.source!.line, lineOf('// the greeting'));
    expect(found.usedAt.first.line, lineOf('// the app'));
  });

  testWidgets('a press by the left edge of an iOS page is the widget there, not the back swipe strip', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: ThemeData(platform: TargetPlatform.iOS), home: const HomePage()));
    tester.state<NavigatorState>(find.byType(Navigator)).push(MaterialPageRoute<void>(builder: (_) => const DetailPage()));
    await tester.pumpAndSettle();
    final host = tester.element(find.byType(MaterialApp));
    final edge = tester.getRect(find.text('Edge'));

    final found = inspectAt(Offset(edge.left + 2, edge.center.dy), host).element!;

    expect(found.name, 'DetailPage › Text');
    expect(found.source!.line, lineOf('// the edge'));
  });
}
