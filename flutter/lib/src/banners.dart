/// A status shown at the top of the screen: a spinner while work goes on, else a glyph.
class StatusBanner {
  const StatusBanner(this.text, {this.glyph, this.working = false});

  final String text;
  final String? glyph;
  final bool working;
}

/// The report went to `agent`.
StatusBanner sentTo(String agent) => StatusBanner('Sent to $agent', working: true);

/// The receiver did not answer, so it cannot say which agent it works for.
const offline = StatusBanner('FixKit is not listening', glyph: '!');

/// The banner for a report's status as the receiver gives it.
StatusBanner bannerFor(String status, String agent) => switch (status) {
  'fixing' => StatusBanner('$agent is fixing it', working: true),
  'rebuilding' => const StatusBanner('Rebuilding the app', working: true),
  'live' => StatusBanner('Fixed by $agent', glyph: '✓'),
  'stopped' => StatusBanner('Not applied: see $agent', glyph: '✕'),
  _ => StatusBanner('Queued in $agent', working: true),
};

/// A report the agent is done with: its fix is on screen, or the turn ended without it.
bool isOver(String status) => status == 'live' || status == 'stopped';
