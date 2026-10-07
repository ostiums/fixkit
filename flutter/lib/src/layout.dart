import 'dart:math' as math;
import 'dart:ui';

/// How far the app slides up so the pressed element stays 28 pt above the composer.
double liftFor(double elementBottom, double composerTop) => math.max(0, elementBottom + 28 - composerTop);

/// The frame with `margin` around it, or without one a square of `radius` around the touch.
Rect around(Rect? frame, Offset touch, double margin, double radius) =>
    frame != null ? frame.inflate(margin) : Rect.fromCircle(center: touch, radius: radius);

/// The lit area: the element's frame and 6 pt around it, or a square around the touch, moved with the app.
Rect spotlight(Rect? frame, Offset touch, double lift) => around(frame, touch, 6, 28).translate(0, -lift);

/// The four dimmed rectangles around the lit area: above, below, left and right of it.
List<Rect> dimAround(Rect lit, Size size) {
  final top = lit.top.clamp(0, size.height).toDouble();
  final bottom = lit.bottom.clamp(top, size.height).toDouble();
  final left = lit.left.clamp(0, size.width).toDouble();
  final right = lit.right.clamp(left, size.width).toDouble();
  return [
    Rect.fromLTRB(0, 0, size.width, top),
    Rect.fromLTRB(0, bottom, size.width, size.height),
    Rect.fromLTRB(0, top, left, bottom),
    Rect.fromLTRB(right, top, size.width, bottom),
  ];
}
