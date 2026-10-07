/// A status shown at the top of the screen: a spinner while work goes on, else a glyph.
class StatusBanner {
  const StatusBanner(this.text, {this.glyph, this.working = false});

  final String text;
  final String? glyph;
  final bool working;
}

const sent = StatusBanner('Sent to Claude Code', working: true);
const offline = StatusBanner('Claude Code is not listening', glyph: '!');

/// The banner for a report's status as the receiver gives it.
StatusBanner bannerFor(String status) => switch (status) {
  'fixing' => const StatusBanner('Claude is fixing it', working: true),
  'rebuilding' => const StatusBanner('Rebuilding the app', working: true),
  'live' => const StatusBanner('Fixed by Claude Code', glyph: '✓'),
  'stopped' => const StatusBanner('Not applied: see Claude Code', glyph: '✕'),
  _ => const StatusBanner('Queued in Claude Code', working: true),
};

/// A report Claude is done with: its fix is on screen, or the turn ended without it.
bool isOver(String status) => status == 'live' || status == 'stopped';
