import 'dart:ui';

import 'package:fixkit/src/layout.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the app slides up only as far as keeps the element 28 pt above the composer', () {
    expect(liftFor(600, 700), 0);
    expect(liftFor(690, 700), 18);
  });

  test('around a frame by the margin, or a square of the radius around the touch', () {
    expect(around(const Rect.fromLTWH(10, 20, 30, 40), Offset.zero, 4, 22), const Rect.fromLTWH(6, 16, 38, 48));
    expect(around(null, const Offset(100, 100), 4, 22), const Rect.fromLTWH(78, 78, 44, 44));
  });

  test('the lit area moves with the app', () {
    expect(spotlight(const Rect.fromLTWH(10, 100, 30, 40), Offset.zero, 50), const Rect.fromLTWH(4, 44, 42, 52));
  });

  test('four dimmed rectangles cover the screen but the lit area', () {
    final dims = dimAround(const Rect.fromLTWH(10, 20, 30, 40), const Size(100, 200));
    expect(dims, const [
      Rect.fromLTWH(0, 0, 100, 20),
      Rect.fromLTWH(0, 60, 100, 140),
      Rect.fromLTWH(0, 20, 10, 40),
      Rect.fromLTWH(40, 20, 60, 40),
    ]);
  });

  test('a lit area off the screen leaves it all dimmed, nothing negative', () {
    final dims = dimAround(const Rect.fromLTWH(-50, 250, 30, 40), const Size(100, 200));
    expect(dims.every((rect) => rect.width >= 0 && rect.height >= 0), isTrue);
    expect(dims.first, const Rect.fromLTWH(0, 0, 100, 200));
  });
}
