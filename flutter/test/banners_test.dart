import 'package:fixkit/src/banners.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('each status has its words; working ones spin', () {
    expect(bannerFor('queued').text, 'Queued in Claude Code');
    expect(bannerFor('fixing').text, 'Claude is fixing it');
    expect(bannerFor('rebuilding').text, 'Rebuilding the app');
    expect(bannerFor('live').text, 'Fixed by Claude Code');
    expect(bannerFor('live').working, isFalse);
    expect(bannerFor('stopped').text, 'Not applied: see Claude Code');
    expect(bannerFor('fixing').working, isTrue);
  });

  test('a report is over once live or stopped', () {
    expect(isOver('live'), isTrue);
    expect(isOver('stopped'), isTrue);
    expect(isOver('fixing'), isFalse);
  });
}
