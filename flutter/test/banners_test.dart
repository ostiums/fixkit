import 'package:fixkit/src/banners.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('each status has its words; working ones spin', () {
    expect(bannerFor('queued', 'Claude Code').text, 'Queued in Claude Code');
    expect(bannerFor('fixing', 'Claude Code').text, 'Claude Code is fixing it');
    expect(bannerFor('rebuilding', 'Claude Code').text, 'Rebuilding the app');
    expect(bannerFor('live', 'Claude Code').text, 'Fixed by Claude Code');
    expect(bannerFor('live', 'Claude Code').working, isFalse);
    expect(bannerFor('stopped', 'Claude Code').text, 'Not applied: see Claude Code');
    expect(bannerFor('fixing', 'Claude Code').working, isTrue);
  });

  test('the banners name the agent that runs the fix', () {
    expect(bannerFor('queued', 'Codex').text, 'Queued in Codex');
    expect(bannerFor('fixing', 'Codex').text, 'Codex is fixing it');
    expect(bannerFor('rebuilding', 'Codex').text, 'Rebuilding the app');
    expect(bannerFor('live', 'Codex').text, 'Fixed by Codex');
    expect(bannerFor('stopped', 'Codex').text, 'Not applied: see Codex');
    expect(sentTo('Codex').text, 'Sent to Codex');
    expect(sentTo('Codex').working, isTrue);
  });

  test('not listening names the agent last heard from, else none', () {
    expect(offlineFor('Codex').text, 'Codex is not listening');
    expect(offlineFor(null).text, 'No agent is listening');
    expect(offlineFor(null).glyph, '!');
  });

  test('a report is over once live or stopped', () {
    expect(isOver('live'), isTrue);
    expect(isOver('stopped'), isTrue);
    expect(isOver('fixing'), isFalse);
  });
}
