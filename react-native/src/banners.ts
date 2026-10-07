/** A status shown at the top of the screen: a spinner while work goes on, else a glyph. */
export type Banner = { text: string; glyph: string | null; working: boolean }

export const SENT: Banner = { text: 'Sent to Claude Code', glyph: null, working: true }
export const OFFLINE: Banner = { text: 'Claude Code is not listening', glyph: '!', working: false }

/** The banner for a report's status as the receiver gives it. */
export function bannerFor(status: string): Banner {
  switch (status) {
    case 'fixing':
      return { text: 'Claude is fixing it', glyph: null, working: true }
    case 'rebuilding':
      return { text: 'Rebuilding the app', glyph: null, working: true }
    case 'live':
      return { text: 'Fixed by Claude Code', glyph: '✓', working: false }
    case 'stopped':
      return { text: 'Not applied: see Claude Code', glyph: '✕', working: false }
    default:
      return { text: 'Queued in Claude Code', glyph: null, working: true }
  }
}
