import 'package:fixkit/src/banners.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('each status has its words, naming the agent; working ones spin', () {
    for (final agent in ['Claude Code', 'Codex']) {
      expect(bannerFor('queued', agent).text, 'Queued in $agent');
      expect(bannerFor('fixing', agent).text, '$agent is fixing it');
      expect(bannerFor('rebuilding', agent).text, 'Rebuilding the app');
      expect(bannerFor('live', agent).text, 'Fixed by $agent');
      expect(bannerFor('stopped', agent).text, 'Not applied: see $agent');
      expect(sentTo(agent).text, 'Sent to $agent');
    }
    expect(bannerFor('live', 'Codex').working, isFalse);
    expect(bannerFor('fixing', 'Codex').working, isTrue);
    expect(sentTo('Codex').working, isTrue);
  });

  test('not listening names the agent last heard from, else none', () {
    expect(offlineFor('Codex').text, 'Codex is not listening');
    expect(offlineFor(null).text, 'No agent is listening');
    expect(offlineFor(null).glyph, '!');
  });

  test('the composer asks for the agent last heard from, else for no one', () {
    expect(composerHint('Codex'), 'What should Codex fix here?');
    expect(composerHint(null), 'What needs fixing here?');
  });

  test('a report is over once live or stopped', () {
    expect(isOver('live'), isTrue);
    expect(isOver('stopped'), isTrue);
    expect(isOver('fixing'), isFalse);
  });
}
